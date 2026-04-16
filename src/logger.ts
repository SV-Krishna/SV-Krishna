import type { LogLevel } from "./types";

const weight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly level: LogLevel) {}

  debug(message: string): void {
    this.log("debug", message);
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }

  error(message: string): void {
    this.log("error", message);
  }

  private log(level: LogLevel, message: string): void {
    if (weight[level] < weight[this.level]) {
      return;
    }

    const stamp = new Date().toISOString();
    process.stdout.write(`[${stamp}] ${level.toUpperCase()} ${message}\n`);
  }
}
