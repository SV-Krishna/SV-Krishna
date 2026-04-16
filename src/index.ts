import { loadConfig } from "./config";
import { ControllerApp } from "./controller";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const controller = new ControllerApp(config);

  const shutdown = (): void => {
    controller.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await controller.start();
};

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Fatal startup error: ${detail}\n`);
  process.exit(1);
});
