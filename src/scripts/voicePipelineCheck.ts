import { mkdir } from "node:fs/promises";
import { LinuxAudio } from "../audio/linuxAudio";
import { loadConfig } from "../config";
import { PiperClient } from "../services/piperClient";
import { RasaClient } from "../services/rasaClient";
import { WhisperClient } from "../services/whisperClient";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const audio = new LinuxAudio(config);
  const whisper = new WhisperClient(config);
  const rasa = new RasaClient(config);
  const piper = new PiperClient(config);

  await mkdir(config.audioWorkDir, { recursive: true });

  process.stdout.write("=== Voice Pipeline Check ===\n");
  process.stdout.write(`audio_input=${config.audioInputDevice}\n`);
  process.stdout.write(`audio_output=${config.audioOutputDevice}\n`);
  process.stdout.write(`record_seconds=${config.audioRecordSeconds}\n`);
  process.stdout.write(`sample_rate=${config.audioSampleRate}\n`);
  process.stdout.write(`whisper=${config.services.find((s) => s.name === "whisper")?.url}\n`);
  process.stdout.write(`rasa=${config.services.find((s) => s.name === "rasa")?.url}\n`);
  process.stdout.write(`tts_enabled=${config.enableTts}\n\n`);

  process.stdout.write("Recording...\n");
  const wavPath = await audio.recordSample();
  process.stdout.write(`Recorded: ${wavPath}\n`);

  process.stdout.write("Transcribing...\n");
  const transcript = await whisper.transcribe(wavPath);
  process.stdout.write(`Transcript: ${transcript || "[empty]"}\n`);

  if (!transcript) {
    process.stdout.write("No transcript returned. If you spoke clearly, check input device/gain.\n");
    return;
  }

  process.stdout.write("Parsing with Rasa...\n");
  const parsed = await rasa.parse(transcript);
  const reply = parsed
    ? `Intent ${parsed.intentName} at ${(parsed.confidence * 100).toFixed(1)}% confidence.`
    : "No Rasa intent returned.";
  process.stdout.write(`Reply: ${reply}\n`);

  if (config.enableTts) {
    process.stdout.write("Synthesizing (Piper)...\n");
    const speechPath = await piper.synthesize(reply);
    process.stdout.write(`Speech: ${speechPath}\n`);
    if (speechPath) {
      process.stdout.write("Playing...\n");
      await audio.playFile(speechPath);
    }
  }
};

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`voice check failed: ${detail}\n`);
  process.exit(1);
});
