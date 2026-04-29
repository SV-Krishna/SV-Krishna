export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ServiceEndpoint {
  name: "ollama" | "whisper" | "piper";
  enabled: boolean;
  url: string;
}

export interface AppConfig {
  nodeEnv: string;
  logLevel: LogLevel;
  enableWebUi: boolean;
  webUiHost: string;
  webUiPort: number;
  enableEmbeddingPoc: boolean;
  embeddingModel: string;
  embeddingStorePath: string;
  embeddingTopK: number;
  pushToTalkKey: string;
  audioInputDevice: string;
  audioOutputDevice: string;
  audioWorkDir: string;
  audioRecordSeconds: number;
  audioSampleRate: number;
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
  marineTelemetryEnabled: boolean;
  signalKUrl: string;
  signalKToken: string;
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
