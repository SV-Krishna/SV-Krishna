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

  return value === "true" || value === "1" || value === "yes" || value === "y" || value === "on";
};

const readNumber = (name: string, fallback: number): number => {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readFloat = (name: string, fallback: number): number => {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readStringList = (name: string, fallback: string[]): string[] => {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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
      name: "whisper",
      enabled: readBoolean("ENABLE_WHISPER_HTTP", true),
      url: readString("WHISPER_ENDPOINT", "http://127.0.0.1:9001"),
    },
    {
      name: "piper",
      enabled: readBoolean("ENABLE_PIPER_HTTP", false),
      url: readString("PIPER_ENDPOINT", "http://127.0.0.1:9002"),
    },
    {
      name: "rasa",
      enabled: readBoolean("ENABLE_RASA_INTENT_ROUTER", true),
      url: readString("RASA_ENDPOINT", "http://127.0.0.1:5005"),
    },
  ];

  return {
    nodeEnv,
    logLevel: readLogLevel(),
    enableWebUi: readBoolean("ENABLE_WEB_UI", true),
    webUiHost: readString("WEB_UI_HOST", "0.0.0.0"),
    webUiPort: readNumber("WEB_UI_PORT", 8080),
    enableWakeWord: readBoolean("ENABLE_WAKE_WORD", false),
    wakeWordPhrase: readString("WAKE_WORD_PHRASE", "Okay Krishna"),
    wakeWordConfigPath: readString(
      "WAKE_WORD_CONFIG_PATH",
      nodeEnv === "development"
        ? `${devDataRoot}/config/wake-word.json`
        : "/opt/svkrishna/config/wake-word.json",
    ),
    signalkAlertMonitorConfigPath: readString(
      "SIGNALK_ALERT_MONITOR_CONFIG_PATH",
      nodeEnv === "development"
        ? `${devDataRoot}/config/signalk-alert-monitor.json`
        : "/opt/svkrishna/config/signalk-alert-monitor.json",
    ),
    wakeWordPythonPath: readString("WAKE_WORD_PYTHON", "python3"),
    wakeWordModelPath: readString(
      "WAKE_WORD_MODEL_PATH",
      nodeEnv === "development"
        ? `${process.cwd()}/local/svkrishna/models/openwakeword/krishna.onnx`
        : "/opt/svkrishna/models/openwakeword/krishna.onnx",
    ),
    wakeWordThreshold: readFloat("WAKE_WORD_THRESHOLD", 0.5),
    wakeWordChunkSize: readNumber("WAKE_WORD_CHUNK_SIZE", 1280),
    wakeWordCooldownMs: readNumber("WAKE_WORD_COOLDOWN_MS", 8000),
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
    audioInputChannels: Math.max(1, readNumber("AUDIO_INPUT_CHANNELS", 1)),
    audioInputChannelSelect: (() => {
      const value = readString("AUDIO_INPUT_CHANNEL_SELECT", "mix").toLowerCase();
      return value === "left" || value === "right" ? value : "mix";
    })(),
    audioOutputDevice: readString("AUDIO_OUTPUT_DEVICE", "default"),
    audioWorkDir: readString(
      "AUDIO_WORK_DIR",
      nodeEnv === "development" ? `${devDataRoot}/audio` : "/opt/svkrishna/audio",
    ),
    audioRecordSeconds: readNumber("AUDIO_RECORD_SECONDS", 5),
    audioUseVad: readBoolean("AUDIO_USE_VAD", true),
    audioVadMinSpeechSeconds: readNumber("AUDIO_VAD_MIN_SPEECH_SECONDS", 1),
    audioVadSilenceSeconds: readNumber("AUDIO_VAD_SILENCE_SECONDS", 1),
    audioVadMaxSeconds: readNumber("AUDIO_VAD_MAX_SECONDS", 8),
    audioVadThresholdPercent: readNumber("AUDIO_VAD_THRESHOLD_PERCENT", 2),
    audioSampleRate: readNumber("AUDIO_SAMPLE_RATE", 16000),
    audioCaptureBoostDb: readNumber("AUDIO_CAPTURE_BOOST_DB", 0),
    audioCaptureHighpassHz: readNumber("AUDIO_CAPTURE_HIGHPASS_HZ", 120),
    audioCaptureLowpassHz: readNumber("AUDIO_CAPTURE_LOWPASS_HZ", 7000),
    reSpeakerLedEnabled: readBoolean("RESPEAKER_LED_ENABLED", false),
    reSpeakerLedHostPath: readString(
      "RESPEAKER_LED_HOST_PATH",
      nodeEnv === "development"
        ? `${process.cwd()}/local/tools/respeaker-xvf3800/xvf_host`
        : "/opt/svkrishna/tools/respeaker-xvf3800/xvf_host",
    ),
    reSpeakerXvfEnabled: readBoolean("RESPEAKER_XVF_ENABLED", false),
    reSpeakerXvfHostPath: readString(
      "RESPEAKER_XVF_HOST_PATH",
      nodeEnv === "development"
        ? `${process.cwd()}/local/tools/respeaker-xvf3800/xvf_host`
        : "/opt/svkrishna/tools/respeaker-xvf3800/xvf_host",
    ),
    reSpeakerXvfAutoRoute: readBoolean("RESPEAKER_XVF_AUTO_ROUTE", true),
    reSpeakerXvfOutputLeftCategory: readNumber("RESPEAKER_XVF_OUTPUT_LEFT_CATEGORY", 8),
    reSpeakerXvfOutputLeftSource: readNumber("RESPEAKER_XVF_OUTPUT_LEFT_SOURCE", 0),
    reSpeakerXvfOutputRightCategory: readNumber("RESPEAKER_XVF_OUTPUT_RIGHT_CATEGORY", 7),
    reSpeakerXvfOutputRightSource: readNumber("RESPEAKER_XVF_OUTPUT_RIGHT_SOURCE", 3),
    enableAudioPlaybackDebug: readBoolean("ENABLE_AUDIO_PLAYBACK_DEBUG", false),
    whisperLanguage: readString("WHISPER_LANGUAGE", "en"),
    enableTts: readBoolean("ENABLE_TTS", true),
    enableRag: readBoolean("ENABLE_RAG", false),
    ragAllowIngest: readBoolean("RAG_ALLOW_INGEST", nodeEnv === "development"),
    ragSourceDir: readString(
      "RAG_SOURCE_DIR",
      nodeEnv === "development" ? `${devDataRoot}/rag/inbox` : "/opt/svkrishna/rag/inbox",
    ),
    ragStorePath: readString(
      "RAG_STORE_PATH",
      nodeEnv === "development" ? `${devDataRoot}/rag/store.json` : "/opt/svkrishna/rag/store.json",
    ),
    vesselContextPath: readString(
      "VESSEL_CONTEXT_PATH",
      nodeEnv === "development"
        ? `${devDataRoot}/config/vessel-context.md`
        : "/opt/svkrishna/config/vessel-context.md",
    ),
    ragChunkSize: readNumber("RAG_CHUNK_SIZE", 120),
    ragChunkOverlap: readNumber("RAG_CHUNK_OVERLAP", 30),
    ragTopK: readNumber("RAG_TOP_K", 3),
    ragExtractorPython: readString("RAG_EXTRACTOR_PYTHON", "python3"),
    ragExtractorMode,
    ollamaModel: readString("OLLAMA_MODEL", "qwen2.5:1.5b"),
    ollamaToolModel: readString("OLLAMA_TOOL_MODEL", ""),
    ollamaSystemPrompt: readString(
      "OLLAMA_SYSTEM_PROMPT",
      "You are a concise offline boat assistant for SV Krishna. Answer clearly and briefly.",
    ),
    ollamaKeepAlive: readString("OLLAMA_KEEP_ALIVE", "30m"),
    ollamaWarmupIntervalMs: readNumber("OLLAMA_WARMUP_INTERVAL_MS", 120000),
    relayControlEnabled: readBoolean("RELAY_CONTROL_ENABLED", false),
    relayBaseUrl: readString("RELAY_BASE_URL", "http://192.168.4.1"),
    relayRequireConfirmation: readBoolean("RELAY_REQUIRE_CONFIRMATION", true),
    piperBinaryPath: readString("PIPER_BINARY_PATH", "piper"),
    piperModelPath: readString("PIPER_MODEL_PATH", "/path/to/piper/voice/model.onnx"),
    enableTranscribingCue: readBoolean("ENABLE_TRANSCRIBING_CUE", true),
    transcribingCueText: readString("TRANSCRIBING_CUE_TEXT", "I'm on it"),
    marineTelemetryEnabled: readBoolean("MARINE_TELEMETRY_ENABLED", false),
    signalKUrl: readString("SIGNALK_URL", "http://127.0.0.1:3000"),
    signalKToken: readString("SIGNALK_TOKEN", ""),
    signalKDraftMaxM: readNumber("SIGNALK_DRAFT_MAX_M", 0),
    remoteSignalKUrl: readString("REMOTE_SIGNALK_URL", ""),
    remoteSignalKToken: readString("REMOTE_SIGNALK_TOKEN", ""),
    remoteSignalKPositionMaxAgeSeconds: readNumber("REMOTE_SIGNALK_POSITION_MAX_AGE_SECONDS", 30),
    signalkAliasStorePath: readString(
      "SIGNALK_ALIAS_STORE_PATH",
      nodeEnv === "development"
        ? `${devDataRoot}/config/signalk-alias-store.json`
        : "/opt/svkrishna/config/signalk-alias-store.json",
    ),
    influxdbUrl: readString("INFLUXDB_URL", "http://127.0.0.1:8086"),
    influxdbOrg: readString("INFLUXDB_ORG", ""),
    influxdbBucket: readString("INFLUXDB_BUCKET", ""),
    influxdbToken: readString("INFLUXDB_TOKEN", ""),
    signalkMcpCommand: readString("SIGNALK_MCP_COMMAND", "npx"),
    signalkMcpArgs: readString("SIGNALK_MCP_ARGS", "-y signalk-mcp-server"),
    influxdbMcpCommand: readString("INFLUXDB_MCP_COMMAND", "npx"),
    influxdbMcpArgs: readString("INFLUXDB_MCP_ARGS", "-y influxdb-mcp-server --stdio"),
    marineMcpRequestTimeoutMs: readNumber("MARINE_MCP_REQUEST_TIMEOUT_MS", 15000),
    marineMcpMaxCalls: readNumber("MARINE_MCP_MAX_CALLS", 4),
    signalkAlertMonitorEnabled: readBoolean("SIGNALK_ALERT_MONITOR_ENABLED", false),
    signalkAlertPaths: readStringList("SIGNALK_ALERT_PATHS", ["notifications.environment.depth.belowTransducer"]),
    signalkAlertPollMs: readNumber("SIGNALK_ALERT_POLL_MS", 2000),
    signalkAlertRepeatSeconds: readNumber("SIGNALK_ALERT_REPEAT_SECONDS", 30),
    signalkAlertSnoozeSeconds: readNumber("SIGNALK_ALERT_SNOOZE_SECONDS", 300),
    enableRasaIntentRouter: readBoolean("ENABLE_RASA_INTENT_ROUTER", true),
    rasaEndpoint: readString("RASA_ENDPOINT", "http://127.0.0.1:5005"),
    rasaIntentMinConfidence: readNumber("RASA_INTENT_MIN_CONFIDENCE", 70),
    enableHarnessEval: readBoolean("ENABLE_HARNESS_EVAL", false),
    harnessEvalLogPath: readString(
      "HARNESS_EVAL_LOG_PATH",
      nodeEnv === "development"
        ? `${devDataRoot}/logs/harness-eval.jsonl`
        : "/opt/svkrishna/logs/harness-eval.jsonl",
    ),
    services,
  };
};
