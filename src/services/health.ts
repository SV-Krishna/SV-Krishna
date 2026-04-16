import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import type { ServiceEndpoint, ServiceHealth } from "../types";

const requestWithTimeout = async (target: URL, timeoutMs: number): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const requestImpl = target.protocol === "https:" ? httpsRequest : httpRequest;
    const req = requestImpl(
      target,
      {
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }

        reject(new Error(`unexpected status ${res.statusCode ?? "unknown"}`));
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
};

const healthTarget = (service: ServiceEndpoint): URL => {
  const url = new URL(service.url);
  if (service.name === "ollama") {
    url.pathname = "/api/tags";
  }
  return url;
};

export const checkServiceHealth = async (
  service: ServiceEndpoint,
  timeoutMs = 1500,
): Promise<ServiceHealth> => {
  if (!service.enabled) {
    return {
      name: service.name,
      enabled: false,
      ok: true,
      detail: "disabled",
    };
  }

  try {
    await requestWithTimeout(healthTarget(service), timeoutMs);
    return {
      name: service.name,
      enabled: true,
      ok: true,
      detail: service.url,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return {
      name: service.name,
      enabled: true,
      ok: false,
      detail,
    };
  }
};
