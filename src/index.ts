import { loadConfig } from "./config";
import { ControllerApp } from "./controller";
import { WebServer } from "./web/webServer";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const controller = new ControllerApp(config);
  const web = new WebServer(config, {
    voice: {
      runOnce: async (options) => await controller.runVoiceOnce(options),
      executeRelay: async (command) => await controller.executeRelay(command),
    },
  });

  const shutdown = async (): Promise<void> => {
    controller.stop();
    await web.stop();
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await web.start();
  await controller.start({ enableTerminalInput: process.stdin.isTTY });
};

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Fatal startup error: ${detail}\n`);
  process.exit(1);
});
