import type { AppConfig, ControllerState, PreflightCheck, ServiceHealth } from "../types";

const clearScreen = (): void => {
  if (process.stdout.isTTY) {
    process.stdout.write("\u001Bc");
  }
};

const keyHint = (key: string): string => {
  return key === "space" ? "Space" : key;
};

export class TerminalRenderer {
  renderStartup(config: AppConfig, health: ServiceHealth[], checks: PreflightCheck[]): void {
    clearScreen();
    process.stdout.write("SV Krishna Offline Voice Assistant\n");
    process.stdout.write("=================================\n\n");
    process.stdout.write(`Mode: host-native controller\n`);
    process.stdout.write(`Push-to-talk key: ${keyHint(config.pushToTalkKey)}\n`);
    process.stdout.write(`Audio input: ${config.audioInputDevice}\n`);
    process.stdout.write(`Audio output: ${config.audioOutputDevice}\n`);
    process.stdout.write(`Record duration: ${config.audioRecordSeconds}s\n`);
    process.stdout.write(`Sample rate: ${config.audioSampleRate}Hz\n`);
    process.stdout.write(`Playback debug: ${config.enableAudioPlaybackDebug ? "on" : "off"}\n`);
    process.stdout.write(`Whisper language: ${config.whisperLanguage}\n`);
    process.stdout.write(`Ollama model: ${config.ollamaModel}\n\n`);
    process.stdout.write(`TTS enabled: ${config.enableTts ? "on" : "off"}\n\n`);
    process.stdout.write(
      `RAG source: ${config.enableRag ? config.ragSourceDir : "disabled"}\n\n`,
    );
    process.stdout.write("Service health\n");
    process.stdout.write("--------------\n");
    for (const service of health) {
      const symbol = service.ok ? "OK " : "NO ";
      process.stdout.write(`${symbol} ${service.name}: ${service.detail}\n`);
    }
    process.stdout.write("\n");
    process.stdout.write("Preflight checks\n");
    process.stdout.write("----------------\n");
    for (const check of checks) {
      const symbol = check.ok ? "OK " : "NO ";
      process.stdout.write(`${symbol} ${check.name}: ${check.detail}\n`);
    }
    process.stdout.write("\n");
  }

  renderState(state: ControllerState, message: string): void {
    process.stdout.write(`[state:${state}] ${message}\n`);
  }

  renderHelp(): void {
    process.stdout.write("\n");
    process.stdout.write("Controls\n");
    process.stdout.write("--------\n");
    process.stdout.write("Press Space to run the full voice loop: record, transcribe, think, and speak.\n");
    process.stdout.write("Press t to enter typed-input mode and send a prompt directly to Ollama.\n");
    process.stdout.write("Press r to rebuild the local PDF RAG store from the drop folder.\n");
    process.stdout.write("Press h to show this help.\n");
    process.stdout.write("Press q or Ctrl+C to quit.\n\n");
  }
}
