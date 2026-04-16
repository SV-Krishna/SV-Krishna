import dotenv from "dotenv";
import type { AppConfig, LogLevel, ServiceEndpoint } from "./types";

dotenv.config();

const VALID_LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

const readString = (name: string, fallback: string): string => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
};

const readBoolean = (name: string, fallback: boolean): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  return value === "true";
};

const readNumber = (name: string, fallback: number): number => {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readLogLevel = (): LogLevel => {
  const value = readString("LOG_LEVEL", "info") as LogLevel;
  return VALID_LOG_LEVELS.has(value) ? value : "info";
};

export const loadConfig = (): AppConfig => {
  const services: ServiceEndpoint[] = [
    {
      name: "ollama",
      enabled: true,
      url: readString("OLLAMA_ENDPOINT", "http://127.0.0.1:11434"),
    },
    {
      name: "whisper",
      enabled: readBoolean("ENABLE_WHISPER_HTTP", true),
      url: readString("WHISPER_ENDPOINT", "http://127.0.0.1:9001"),
    },
    {
      name: "piper",
      enabled: readBoolean("ENABLE_PIPER_HTTP", false),
      url: readString("PIPER_ENDPOINT", "http://127.0.0.1:9002"),
    },
  ];

  return {
    nodeEnv: readString("NODE_ENV", "development"),
    logLevel: readLogLevel(),
    pushToTalkKey: readString("PUSH_TO_TALK_KEY", "space"),
    audioInputDevice: readString("AUDIO_INPUT_DEVICE", "default"),
    audioOutputDevice: readString("AUDIO_OUTPUT_DEVICE", "default"),
    audioWorkDir: readString("AUDIO_WORK_DIR", "/opt/svkrishna/audio"),
    audioRecordSeconds: readNumber("AUDIO_RECORD_SECONDS", 5),
    audioSampleRate: readNumber("AUDIO_SAMPLE_RATE", 16000),
    enableAudioPlaybackDebug: readBoolean("ENABLE_AUDIO_PLAYBACK_DEBUG", false),
    whisperLanguage: readString("WHISPER_LANGUAGE", "en"),
    enableTts: readBoolean("ENABLE_TTS", true),
    enableRag: readBoolean("ENABLE_RAG", true),
    ragSourceDir: readString("RAG_SOURCE_DIR", "/opt/svkrishna/rag/inbox"),
    ragStorePath: readString("RAG_STORE_PATH", "/opt/svkrishna/rag/store.json"),
    ragChunkSize: readNumber("RAG_CHUNK_SIZE", 120),
    ragChunkOverlap: readNumber("RAG_CHUNK_OVERLAP", 30),
    ragTopK: readNumber("RAG_TOP_K", 4),
    ragExtractorPython: readString("RAG_EXTRACTOR_PYTHON", "python3"),
    ollamaModel: readString("OLLAMA_MODEL", "gemma3:1b"),
    ollamaSystemPrompt: readString(
      "OLLAMA_SYSTEM_PROMPT",
      "You are a concise offline boat assistant for SV Krishna. Answer clearly and briefly.",
    ),
    piperBinaryPath: readString("PIPER_BINARY_PATH", "piper"),
    piperModelPath: readString("PIPER_MODEL_PATH", "/path/to/piper/voice/model.onnx"),
    services,
  };
};
