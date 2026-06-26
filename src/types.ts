export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ServiceEndpoint {
  name: "ollama" | "whisper" | "piper" | "rasa";
  enabled: boolean;
  url: string;
}

export interface AppConfig {
  nodeEnv: string;
  logLevel: LogLevel;
  enableWebUi: boolean;
  webUiHost: string;
  webUiPort: number;
  enableWakeWord: boolean;
  wakeWordPhrase: string;
  wakeWordConfigPath: string;
  wakeWordPythonPath: string;
  wakeWordModelPath: string;
  wakeWordThreshold: number;
  wakeWordChunkSize: number;
  wakeWordCooldownMs: number;
  enableEmbeddingPoc: boolean;
  embeddingModel: string;
  embeddingStorePath: string;
  embeddingTopK: number;
  pushToTalkKey: string;
  audioInputDevice: string;
  audioInputChannels: number;
  audioInputChannelSelect: "left" | "right" | "mix";
  audioOutputDevice: string;
  audioWorkDir: string;
  audioRecordSeconds: number;
  audioUseVad: boolean;
  audioVadMinSpeechSeconds: number;
  audioVadSilenceSeconds: number;
  audioVadMaxSeconds: number;
  audioVadThresholdPercent: number;
  audioSampleRate: number;
  audioCaptureBoostDb: number;
  audioCaptureHighpassHz: number;
  audioCaptureLowpassHz: number;
  reSpeakerLedEnabled: boolean;
  reSpeakerLedHostPath: string;
  reSpeakerXvfEnabled: boolean;
  reSpeakerXvfHostPath: string;
  reSpeakerXvfAutoRoute: boolean;
  reSpeakerXvfOutputLeftCategory: number;
  reSpeakerXvfOutputLeftSource: number;
  reSpeakerXvfOutputRightCategory: number;
  reSpeakerXvfOutputRightSource: number;
  enableAudioPlaybackDebug: boolean;
  whisperLanguage: string;
  enableTts: boolean;
  enableRag: boolean;
  ragAllowIngest: boolean;
  ragSourceDir: string;
  ragStorePath: string;
  vesselContextPath: string;
  ragChunkSize: number;
  ragChunkOverlap: number;
  ragTopK: number;
  ragExtractorPython: string;
  ragExtractorMode: "pypdf" | "docling" | "opendataloader";
  ollamaModel: string;
  ollamaToolModel: string;
  ollamaSystemPrompt: string;
  ollamaKeepAlive: string;
  ollamaWarmupIntervalMs: number;
  relayControlEnabled: boolean;
  relayBaseUrl: string;
  relayRequireConfirmation: boolean;
  piperBinaryPath: string;
  piperModelPath: string;
  enableTranscribingCue: boolean;
  transcribingCueText: string;
  marineTelemetryEnabled: boolean;
  signalKUrl: string;
  signalKToken: string;
  signalKDraftMaxM: number;
  remoteSignalKUrl: string;
  remoteSignalKToken: string;
  remoteSignalKPositionMaxAgeSeconds: number;
  signalkAliasStorePath: string;
  influxdbUrl: string;
  influxdbOrg: string;
  influxdbBucket: string;
  influxdbToken: string;
  signalkMcpCommand: string;
  signalkMcpArgs: string;
  influxdbMcpCommand: string;
  influxdbMcpArgs: string;
  marineMcpRequestTimeoutMs: number;
  marineMcpMaxCalls: number;
  signalkAlertMonitorEnabled: boolean;
  signalkAlertPaths: string[];
  signalkAlertPollMs: number;
  signalkAlertRepeatSeconds: number;
  enableRasaIntentRouter: boolean;
  rasaEndpoint: string;
  rasaIntentMinConfidence: number;
  enableHarnessEval: boolean;
  harnessEvalLogPath: string;
  services: ServiceEndpoint[];
}

export interface ServiceHealth {
  name: ServiceEndpoint["name"];
  enabled: boolean;
  ok: boolean;
  detail: string;
}

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface RagChunk {
  id: string;
  docKey: string;
  source: string;
  text: string;
  tokens: string[];
  pageStart: number;
  pageEnd: number;
  heading?: string;
  sectionPath: string[];
}

export interface RagSearchResult {
  docKey?: string;
  source: string;
  text: string;
  score: number;
  pageStart: number;
  pageEnd: number;
  heading?: string;
  sectionPath?: string[];
}

export interface ChatResponse {
  reply: string;
  sources: RagSearchResult[];
}

export interface EmbeddingRecord {
  chunkId: string;
  vector: number[];
}

export type ControllerState =
  | "starting"
  | "idle"
  | "listening"
  | "playing"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";
