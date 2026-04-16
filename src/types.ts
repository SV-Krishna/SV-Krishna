export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ServiceEndpoint {
  name: "ollama" | "whisper" | "piper";
  enabled: boolean;
  url: string;
}

export interface AppConfig {
  nodeEnv: string;
  logLevel: LogLevel;
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
  ragSourceDir: string;
  ragStorePath: string;
  ragChunkSize: number;
  ragChunkOverlap: number;
  ragTopK: number;
  ragExtractorPython: string;
  ollamaModel: string;
  ollamaSystemPrompt: string;
  piperBinaryPath: string;
  piperModelPath: string;
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
  source: string;
  text: string;
  tokens: string[];
}

export interface RagSearchResult {
  source: string;
  text: string;
  score: number;
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
