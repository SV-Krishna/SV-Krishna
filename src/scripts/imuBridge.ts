import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import WebSocket from "ws";

interface Calibration {
  rollOffsetDeg: number;
  pitchOffsetDeg: number;
  headingOffsetDeg: number;
}

interface ImuSampleInput {
  rollDeg: number;
  pitchDeg: number;
  headingDeg: number;
  source?: string;
}

interface BridgeConfig {
  host: string;
  port: number;
  statePath: string;
  primaryUrl: string;
  primaryToken: string;
  mirrorUrl: string;
  mirrorToken: string;
}

const readString = (name: string, fallback = ""): string => process.env[name]?.trim() ?? fallback;
const readNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const config: BridgeConfig = {
  host: readString("IMU_BRIDGE_HOST", "0.0.0.0"),
  port: readNumber("IMU_BRIDGE_PORT", 8091),
  statePath: readString("IMU_BRIDGE_STATE_PATH", "/opt/svkrishna/state/imu-bridge-calibration.json"),
  primaryUrl: readString("IMU_BRIDGE_SIGNALK_URL", "http://127.0.0.1:3000"),
  primaryToken: readString("IMU_BRIDGE_SIGNALK_TOKEN", ""),
  mirrorUrl: readString("IMU_BRIDGE_MIRROR_SIGNALK_URL", ""),
  mirrorToken: readString("IMU_BRIDGE_MIRROR_SIGNALK_TOKEN", ""),
};

let calibration: Calibration = {
  rollOffsetDeg: 0,
  pitchOffsetDeg: 0,
  headingOffsetDeg: 0,
};

let lastPublished: Record<string, unknown> | null = null;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const wrapHeadingDeg = (value: number): number => {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const withAuthHeaders = (token: string): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};

const toStreamWsUrl = (baseUrl: string): string => {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.startsWith("https://")) {
    return normalized.replace(/^https:\/\//, "wss://") + "/signalk/v1/stream?subscribe=none";
  }
  if (normalized.startsWith("http://")) {
    return normalized.replace(/^http:\/\//, "ws://") + "/signalk/v1/stream?subscribe=none";
  }
  return normalized + "/signalk/v1/stream?subscribe=none";
};

const loadCalibration = async (): Promise<void> => {
  try {
    const raw = await readFile(config.statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<Calibration>;
    calibration = {
      rollOffsetDeg: Number(parsed.rollOffsetDeg) || 0,
      pitchOffsetDeg: Number(parsed.pitchOffsetDeg) || 0,
      headingOffsetDeg: Number(parsed.headingOffsetDeg) || 0,
    };
  } catch {
    // First run is expected to have no file.
  }
};

const saveCalibration = async (): Promise<void> => {
  await mkdir(dirname(config.statePath), { recursive: true });
  await writeFile(config.statePath, JSON.stringify(calibration, null, 2), "utf8");
};

const buildDelta = (sample: ImuSampleInput): Record<string, unknown> => {
  const rollDeg = sample.rollDeg + calibration.rollOffsetDeg;
  const pitchDeg = sample.pitchDeg + calibration.pitchOffsetDeg;
  const headingDeg = wrapHeadingDeg(sample.headingDeg + calibration.headingOffsetDeg);

  const rollRad = toRadians(rollDeg);
  const pitchRad = toRadians(pitchDeg);
  const yawRad = toRadians(headingDeg);
  const timestamp = new Date().toISOString();

  return {
    context: "vessels.self",
    updates: [
      {
        source: {
          label: sample.source?.trim() || "imu-bridge",
          type: "sensor",
        },
        timestamp,
        values: [
          {
            path: "navigation.attitude",
            value: { roll: rollRad, pitch: pitchRad, yaw: yawRad },
          },
          {
            path: "navigation.headingMagnetic",
            value: yawRad,
          },
          {
            path: "navigation.headingTrue",
            value: yawRad,
          },
        ],
      },
    ],
  };
};

const publishDelta = async (
  baseUrl: string,
  token: string,
  delta: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; detail: string }> => {
  if (!baseUrl) {
    return { ok: false, status: 0, detail: "not configured" };
  }

  const streamUrl = toStreamWsUrl(baseUrl);
  const headers = withAuthHeaders(token);

  return await new Promise((resolvePromise) => {
    let settled = false;
    const settle = (result: { ok: boolean; status: number; detail: string }) => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };

    const socket = new WebSocket(streamUrl, {
      headers,
      handshakeTimeout: 4000,
    });

    const timeout = setTimeout(() => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      settle({ ok: false, status: 504, detail: "websocket publish timeout" });
    }, 4500);

    socket.on("open", () => {
      try {
        socket.send(JSON.stringify(delta));
        clearTimeout(timeout);
        setTimeout(() => {
          try {
            socket.close();
          } catch {
            // ignore
          }
          settle({ ok: true, status: 200, detail: "published via websocket stream" });
        }, 60);
      } catch (error) {
        clearTimeout(timeout);
        settle({
          ok: false,
          status: 500,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      settle({
        ok: false,
        status: 502,
        detail: error instanceof Error ? error.message : String(error),
      });
    });

    socket.on("close", (code) => {
      if (!settled) {
        clearTimeout(timeout);
        settle({ ok: code === 1000, status: code === 1000 ? 200 : 502, detail: `socket closed ${code}` });
      }
    });
  });
};

const readBodyJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
};

const sendJson = (response: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body).toString(),
  });
  response.end(body);
};

const parseSample = (payload: unknown): ImuSampleInput => {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid payload");
  }
  const p = payload as Record<string, unknown>;
  const rollDeg = Number(p.rollDeg);
  const pitchDeg = Number(p.pitchDeg);
  const headingDeg = Number(p.headingDeg);
  if (!Number.isFinite(rollDeg) || !Number.isFinite(pitchDeg) || !Number.isFinite(headingDeg)) {
    throw new Error("rollDeg, pitchDeg, headingDeg are required numbers");
  }
  return {
    rollDeg,
    pitchDeg,
    headingDeg,
    source: typeof p.source === "string" ? p.source : undefined,
  };
};

const applyCalibrationUpdate = (payload: unknown): void => {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid payload");
  }
  const p = payload as Record<string, unknown>;
  if (p.rollOffsetDeg !== undefined) {
    const n = Number(p.rollOffsetDeg);
    if (!Number.isFinite(n)) {
      throw new Error("rollOffsetDeg must be numeric");
    }
    calibration.rollOffsetDeg = n;
  }
  if (p.pitchOffsetDeg !== undefined) {
    const n = Number(p.pitchOffsetDeg);
    if (!Number.isFinite(n)) {
      throw new Error("pitchOffsetDeg must be numeric");
    }
    calibration.pitchOffsetDeg = n;
  }
  if (p.headingOffsetDeg !== undefined) {
    const n = Number(p.headingOffsetDeg);
    if (!Number.isFinite(n)) {
      throw new Error("headingOffsetDeg must be numeric");
    }
    calibration.headingOffsetDeg = n;
  }
};

const setZeroFromReading = (payload: unknown): void => {
  const p = parseSample(payload);
  const targetHeadingDegRaw = (payload as Record<string, unknown>).targetHeadingDeg;
  const targetHeadingDeg = targetHeadingDegRaw === undefined ? 0 : Number(targetHeadingDegRaw);
  if (!Number.isFinite(targetHeadingDeg)) {
    throw new Error("targetHeadingDeg must be numeric");
  }
  calibration.rollOffsetDeg = -p.rollDeg;
  calibration.pitchOffsetDeg = -p.pitchDeg;
  calibration.headingOffsetDeg = wrapHeadingDeg(targetHeadingDeg - p.headingDeg);
};

const route = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      calibration,
      primaryUrl: config.primaryUrl,
      mirrorUrl: config.mirrorUrl || null,
      lastPublishedAt: lastPublished?.timestamp ?? null,
    });
    return;
  }

  if (method === "GET" && url.pathname === "/calibration") {
    sendJson(response, 200, calibration);
    return;
  }

  if (method === "GET" && url.pathname === "/latest") {
    sendJson(response, 200, { latest: lastPublished });
    return;
  }

  if (method === "POST" && url.pathname === "/calibration") {
    const payload = await readBodyJson(request);
    applyCalibrationUpdate(payload);
    await saveCalibration();
    sendJson(response, 200, { ok: true, calibration });
    return;
  }

  if (method === "POST" && url.pathname === "/calibration/zero") {
    const payload = await readBodyJson(request);
    setZeroFromReading(payload);
    await saveCalibration();
    sendJson(response, 200, { ok: true, calibration });
    return;
  }

  if (method === "POST" && url.pathname === "/sample") {
    const payload = await readBodyJson(request);
    const sample = parseSample(payload);
    const delta = buildDelta(sample);
    const [primaryResult, mirrorResult] = await Promise.all([
      publishDelta(config.primaryUrl, config.primaryToken, delta),
      config.mirrorUrl
        ? publishDelta(config.mirrorUrl, config.mirrorToken, delta)
        : Promise.resolve({ ok: true, status: 0, detail: "mirror disabled" }),
    ]);
    lastPublished = {
      timestamp: new Date().toISOString(),
      input: sample,
      delta,
      publish: {
        primary: primaryResult,
        mirror: mirrorResult,
      },
    };
    sendJson(response, primaryResult.ok ? 200 : 502, {
      ok: primaryResult.ok,
      calibration,
      publish: {
        primary: primaryResult,
        mirror: mirrorResult,
      },
    });
    return;
  }

  sendJson(response, 404, { error: "not found" });
};

const main = async (): Promise<void> => {
  await loadCalibration();
  const server = createServer((request, response) => {
    route(request, response).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      sendJson(response, 500, { error: detail });
    });
  });
  server.listen(config.port, config.host, () => {
    process.stdout.write(
      `imu-bridge listening on http://${config.host}:${config.port} -> ${config.primaryUrl}${config.mirrorUrl ? ` (mirror ${config.mirrorUrl})` : ""}\n`,
    );
  });
};

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`imu-bridge failed: ${detail}\n`);
  process.exit(1);
});
