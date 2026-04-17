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
  const nodeEnv = readString("NODE_ENV", "development");
  const devDataRoot = `${process.cwd()}/local/svkrishna`;

  const ragExtractorModeRaw = readString("RAG_EXTRACTOR_MODE", "pypdf").toLowerCase();
  const ragExtractorMode: AppConfig["ragExtractorMode"] =
    ragExtractorModeRaw === "docling" || ragExtractorModeRaw === "opendataloader"
      ? (ragExtractorModeRaw as AppConfig["ragExtractorMode"])
      : "pypdf";

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
    nodeEnv,
    logLevel: readLogLevel(),
    enableWebUi: readBoolean("ENABLE_WEB_UI", true),
    webUiHost: readString("WEB_UI_HOST", "0.0.0.0"),
    webUiPort: readNumber("WEB_UI_PORT", 8080),
    enableEmbeddingPoc: readBoolean("ENABLE_EMBEDDING_POC", false),
    embeddingModel: readString("EMBEDDING_MODEL", "all-minilm:33m"),
    embeddingStorePath: readString(
      "EMBEDDING_STORE_PATH",
      nodeEnv === "development"
        ? `${devDataRoot}/rag/embeddings.json`
        : "/opt/svkrishna/rag/embeddings.json",
    ),
    embeddingTopK: readNumber("EMBEDDING_TOP_K", 3),
    pushToTalkKey: readString("PUSH_TO_TALK_KEY", "space"),
    audioInputDevice: readString("AUDIO_INPUT_DEVICE", "default"),
    audioOutputDevice: readString("AUDIO_OUTPUT_DEVICE", "default"),
    audioWorkDir: readString(
      "AUDIO_WORK_DIR",
      nodeEnv === "development" ? `${devDataRoot}/audio` : "/opt/svkrishna/audio",
    ),
    audioRecordSeconds: readNumber("AUDIO_RECORD_SECONDS", 5),
    audioSampleRate: readNumber("AUDIO_SAMPLE_RATE", 16000),
    enableAudioPlaybackDebug: readBoolean("ENABLE_AUDIO_PLAYBACK_DEBUG", false),
    whisperLanguage: readString("WHISPER_LANGUAGE", "en"),
    enableTts: readBoolean("ENABLE_TTS", true),
    enableRag: readBoolean("ENABLE_RAG", true),
    ragSourceDir: readString(
      "RAG_SOURCE_DIR",
      nodeEnv === "development" ? `${devDataRoot}/rag/inbox` : "/opt/svkrishna/rag/inbox",
    ),
    ragStorePath: readString(
      "RAG_STORE_PATH",
      nodeEnv === "development" ? `${devDataRoot}/rag/store.json` : "/opt/svkrishna/rag/store.json",
    ),
    ragChunkSize: readNumber("RAG_CHUNK_SIZE", 120),
    ragChunkOverlap: readNumber("RAG_CHUNK_OVERLAP", 30),
    ragTopK: readNumber("RAG_TOP_K", 3),
    ragExtractorPython: readString("RAG_EXTRACTOR_PYTHON", "python3"),
    ragExtractorMode,
    ollamaModel: readString("OLLAMA_MODEL", "gemma3:1b"),
    ollamaSystemPrompt: readString(
      "OLLAMA_SYSTEM_PROMPT",
      "You are a concise offline boat assistant for SV Krishna. Answer clearly and briefly.",
    ),
    relayControlEnabled: readBoolean("RELAY_CONTROL_ENABLED", false),
    relayBaseUrl: readString("RELAY_BASE_URL", "http://192.168.4.1"),
    relayRequireConfirmation: readBoolean("RELAY_REQUIRE_CONFIRMATION", true),
    piperBinaryPath: readString("PIPER_BINARY_PATH", "piper"),
    piperModelPath: readString("PIPER_MODEL_PATH", "/path/to/piper/voice/model.onnx"),
    services,
  };
};
