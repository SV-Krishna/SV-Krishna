import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { loadConfig } from "../config";
import { WhisperClient } from "../services/whisperClient";

interface WavData {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Buffer;
}

const runCommand = async (command: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
    child.on("error", reject);
  });
};

const parseWav = (buffer: Buffer): WavData => {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Unsupported WAV container.");
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let pcm: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > buffer.length) {
      break;
    }

    if (chunkId === "fmt ") {
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === "data") {
      pcm = buffer.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!pcm || sampleRate <= 0 || channels <= 0 || bitsPerSample !== 16) {
    throw new Error("Unsupported WAV format. Expected 16-bit PCM with a data chunk.");
  }

  return { sampleRate, channels, bitsPerSample, pcm };
};

const encodeMonoWav = (samples: Int16Array, sampleRate: number): Buffer => {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i] ?? 0, 44 + (i * 2));
  }
  return buffer;
};

const splitStereo = (wav: WavData): { left: Int16Array; right: Int16Array; mix: Int16Array } => {
  if (wav.channels !== 2) {
    throw new Error(`Expected a stereo capture but found ${wav.channels} channels.`);
  }

  const frameCount = wav.pcm.length / 4;
  const left = new Int16Array(frameCount);
  const right = new Int16Array(frameCount);
  const mix = new Int16Array(frameCount);

  for (let i = 0; i < frameCount; i += 1) {
    const leftSample = wav.pcm.readInt16LE(i * 4);
    const rightSample = wav.pcm.readInt16LE((i * 4) + 2);
    left[i] = leftSample;
    right[i] = rightSample;
    mix[i] = Math.round((leftSample + rightSample) / 2);
  }

  return { left, right, mix };
};

const rms = (samples: Int16Array): number => {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
};

const peak = (samples: Int16Array): number => {
  let max = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    if (absolute > max) {
      max = absolute;
    }
  }
  return max;
};

const formatMetric = (samples: Int16Array): string =>
  `rms=${rms(samples).toFixed(1)} peak=${peak(samples)}`;

const transcribeSafely = async (
  whisper: WhisperClient,
  filePath: string,
): Promise<string> => {
  try {
    const transcript = await whisper.transcribe(filePath);
    return transcript || "[empty]";
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `[transcribe failed: ${detail}]`;
  }
};

const resolveProbeDir = async (preferredDir: string): Promise<string> => {
  const overrideDir = process.env.XVF_PROBE_DIR?.trim();
  const candidates = [
    overrideDir,
    join(homedir(), ".cache", "svkrishna-xvf-probe"),
    join(tmpdir(), "svkrishna-xvf-probe"),
    preferredDir,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await mkdir(candidate, { recursive: true });
      await access(candidate, fsConstants.W_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("No writable probe directory available.");
};

const main = async (): Promise<void> => {
  const config = loadConfig();
  const whisper = new WhisperClient(config);
  const recordSeconds = Math.max(1, Number.parseInt(process.env.XVF_PROBE_SECONDS ?? "5", 10) || 5);
  const baseName = `xvf-probe-${Date.now()}`;
  const probeDir = await resolveProbeDir(config.audioWorkDir);

  const stereoPath = join(probeDir, `${baseName}-stereo.wav`);
  const leftPath = join(probeDir, `${baseName}-left.wav`);
  const rightPath = join(probeDir, `${baseName}-right.wav`);
  const mixPath = join(probeDir, `${baseName}-mix.wav`);

  process.stdout.write("=== XVF Routing Probe ===\n");
  process.stdout.write(`input_device=${config.audioInputDevice}\n`);
  process.stdout.write(`configured_channels=${config.audioInputChannels}\n`);
  process.stdout.write(`configured_select=${config.audioInputChannelSelect}\n`);
  process.stdout.write(`probe_dir=${probeDir}\n`);
  process.stdout.write(`record_seconds=${recordSeconds}\n`);
  process.stdout.write("Speak one short test phrase once the recording starts.\n\n");

  await runCommand("arecord", [
    "-D",
    config.audioInputDevice,
    "-d",
    String(recordSeconds),
    "-f",
    "S16_LE",
    "-c",
    "2",
    "-r",
    String(config.audioSampleRate),
    stereoPath,
  ]);

  const stereo = parseWav(await readFile(stereoPath));
  const channels = splitStereo(stereo);
  await writeFile(leftPath, encodeMonoWav(channels.left, stereo.sampleRate));
  await writeFile(rightPath, encodeMonoWav(channels.right, stereo.sampleRate));
  await writeFile(mixPath, encodeMonoWav(channels.mix, stereo.sampleRate));

  process.stdout.write(`stereo=${stereoPath}\n`);
  process.stdout.write(`left=${leftPath} ${formatMetric(channels.left)}\n`);
  process.stdout.write(`right=${rightPath} ${formatMetric(channels.right)}\n`);
  process.stdout.write(`mix=${mixPath} ${formatMetric(channels.mix)}\n\n`);

  const [leftTranscript, rightTranscript, mixTranscript] = await Promise.all([
    transcribeSafely(whisper, leftPath),
    transcribeSafely(whisper, rightPath),
    transcribeSafely(whisper, mixPath),
  ]);

  process.stdout.write(`left_transcript=${leftTranscript}\n`);
  process.stdout.write(`right_transcript=${rightTranscript}\n`);
  process.stdout.write(`mix_transcript=${mixTranscript}\n`);
};

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`xvf routing probe failed: ${detail}\n`);
  process.exit(1);
});
