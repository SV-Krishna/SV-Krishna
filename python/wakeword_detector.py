import argparse
import collections
import json
import signal
import shutil
import subprocess
import sys
import time
import wave
from pathlib import Path

import numpy as np
from openwakeword.model import Model


capture_process: subprocess.Popen[bytes] | None = None


def stop_capture() -> None:
    global capture_process
    if capture_process is None:
        return
    if capture_process.poll() is None:
        capture_process.terminate()
        try:
            capture_process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            capture_process.kill()
            capture_process.wait(timeout=1)
    capture_process = None


def handle_shutdown(_signum: int, _frame: object) -> None:
    stop_capture()
    raise SystemExit(0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--phrase", required=True)
    parser.add_argument("--inference-framework", default="tflite")
    parser.add_argument("--input-device", default="default")
    parser.add_argument("--input-channels", type=int, default=1)
    parser.add_argument("--channel-select", choices=["left", "right", "mix"], default="mix")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--chunk-size", type=int, default=1280)
    parser.add_argument("--cooldown-ms", type=int, default=8000)
    parser.add_argument("--sample-rate", type=int, default=16000)
    parser.add_argument("--command-seconds", type=float, default=6.0)
    parser.add_argument("--output-dir", default=".")
    parser.add_argument("--preroll-ms", type=int, default=800)
    return parser.parse_args()


def build_capture_command(device: str, channels: int) -> list[str]:
    if shutil.which("arecord"):
        return [
            "arecord",
            "-D",
            device,
            "-f",
            "S16_LE",
            "-c",
            str(channels),
            "-r",
            "16000",
            "-t",
            "raw",
            "-q",
            "-",
        ]
    if shutil.which("sox"):
        return [
            "sox",
            "-q",
            "-t",
            "alsa",
            device,
            "-r",
            "16000",
            "-c",
            str(channels),
            "-b",
            "16",
            "-e",
            "signed-integer",
            "-t",
            "raw",
            "-",
        ]
    raise RuntimeError("No microphone capture command available. Install arecord or sox.")


def select_channel(audio: np.ndarray, channels: int, channel_select: str) -> np.ndarray:
    if channels <= 1:
        return audio

    frames = audio.reshape(-1, channels)
    if channel_select == "left":
        return np.ascontiguousarray(frames[:, 0])
    if channel_select == "right":
        index = 1 if channels > 1 else 0
        return np.ascontiguousarray(frames[:, index])

    mixed = np.rint(np.mean(frames, axis=1)).astype(np.int16)
    return np.ascontiguousarray(mixed)


def main() -> int:
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    args = parse_args()
    model_path = Path(args.model_path)
    if not model_path.exists():
        raise RuntimeError(f"Wake word model not found: {model_path}")

    try:
        model = Model(wakeword_model_paths=[str(model_path)])
    except TypeError:
        model = Model(wakeword_models=[str(model_path)])
    capture_command = build_capture_command(args.input_device, args.input_channels)
    global capture_process
    capture_process = subprocess.Popen(
        capture_command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )

    if capture_process.stdout is None:
        raise RuntimeError("Wake word capture process did not provide stdout.")

    bytes_per_chunk = args.chunk_size * args.input_channels * 2
    preroll_chunk_count = max(1, int((args.preroll_ms / 1000) * args.sample_rate / args.chunk_size))
    preroll_chunks: collections.deque[bytes] = collections.deque(maxlen=preroll_chunk_count)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    last_detection = 0.0
    last_score_log = 0.0
    try:
        while True:
            chunk = capture_process.stdout.read(bytes_per_chunk)
            if not chunk or len(chunk) < bytes_per_chunk:
                time.sleep(0.02)
                continue

            audio = np.frombuffer(chunk, dtype=np.int16)
            selected_audio = select_channel(audio, args.input_channels, args.channel_select)
            selected_chunk = selected_audio.tobytes()
            preroll_chunks.append(selected_chunk)
            prediction = model.predict(selected_audio)
            score = max(float(value) for value in prediction.values()) if prediction else 0.0

            now = time.time()
            score_log_floor = max(0.2, args.threshold * 0.5)
            if score >= score_log_floor and (now - last_score_log) >= 1.0:
                sys.stderr.write(f"Wake word score {score:.3f} for phrase {args.phrase}\n")
                sys.stderr.flush()
                last_score_log = now
            if score >= args.threshold and (now - last_detection) * 1000 >= args.cooldown_ms:
                detected_event = {
                    "event": "wake-detected",
                    "phrase": args.phrase,
                    "score": score,
                    "detectedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
                }
                sys.stdout.write(json.dumps(detected_event) + "\n")
                sys.stdout.flush()

                target_bytes = int(args.command_seconds * args.sample_rate * 2)
                capture_bytes = b"".join(preroll_chunks)
                while len(capture_bytes) < target_bytes:
                    follow_chunk = capture_process.stdout.read(bytes_per_chunk)
                    if not follow_chunk:
                        time.sleep(0.02)
                        continue
                    follow_audio = np.frombuffer(follow_chunk, dtype=np.int16)
                    capture_bytes += select_channel(
                        follow_audio,
                        args.input_channels,
                        args.channel_select,
                    ).tobytes()

                audio_path = output_dir / f"sample-{int(now * 1000)}.wav"
                with wave.open(str(audio_path), "wb") as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(args.sample_rate)
                    wav_file.writeframes(capture_bytes[:target_bytes])

                event = {
                    "event": "wake-captured",
                    "phrase": args.phrase,
                    "score": score,
                    "detectedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
                    "filePath": str(audio_path),
                }
                sys.stdout.write(json.dumps(event) + "\n")
                sys.stdout.flush()
                last_detection = now
                preroll_chunks.clear()
    finally:
        stop_capture()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
    except Exception as exc:
        sys.stderr.write(str(exc) + "\n")
        raise SystemExit(1)
