import type { AppConfig, PreflightCheck } from "../types";

const withTimeout = async (
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const joinUrl = (base: string, path: string): string => {
  const cleanBase = base.trim().replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
};

export class MarineTelemetryService {
  constructor(private readonly config: AppConfig) {}

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    if (!this.config.marineTelemetryEnabled) {
      return [];
    }

    const checks: PreflightCheck[] = [];

    checks.push(await this.checkSignalKApi());
    checks.push(await this.checkInfluxHealth());

    if (!this.config.influxdbToken || !this.config.influxdbOrg || !this.config.influxdbBucket) {
      checks.push({
        name: "marine:influx-query",
        ok: false,
        detail: "Set INFLUXDB_TOKEN, INFLUXDB_ORG, and INFLUXDB_BUCKET to enable query checks.",
      });
    } else {
      checks.push(await this.checkInfluxQuery());
    }

    return checks;
  }

  private async checkSignalKApi(): Promise<PreflightCheck> {
    const headers: Record<string, string> = {};
    if (this.config.signalKToken) {
      headers.Authorization = `Bearer ${this.config.signalKToken}`;
    }

    try {
      const response = await withTimeout(
        joinUrl(this.config.signalKUrl, "/signalk/v1/api/"),
        { method: "GET", headers },
        3_000,
      );

      if (response.status === 200) {
        return {
          name: "marine:signalk-api",
          ok: true,
          detail: `${this.config.signalKUrl} reachable`,
        };
      }

      if (response.status === 401 && !this.config.signalKToken) {
        return {
          name: "marine:signalk-api",
          ok: false,
          detail: "SignalK API requires auth. Set SIGNALK_TOKEN.",
        };
      }

      return {
        name: "marine:signalk-api",
        ok: false,
        detail: `SignalK returned HTTP ${response.status}`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        name: "marine:signalk-api",
        ok: false,
        detail,
      };
    }
  }

  private async checkInfluxHealth(): Promise<PreflightCheck> {
    try {
      const response = await withTimeout(joinUrl(this.config.influxdbUrl, "/health"), { method: "GET" }, 3_000);
      if (!response.ok) {
        return {
          name: "marine:influx-health",
          ok: false,
          detail: `InfluxDB returned HTTP ${response.status}`,
        };
      }

      return {
        name: "marine:influx-health",
        ok: true,
        detail: `${this.config.influxdbUrl} reachable`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        name: "marine:influx-health",
        ok: false,
        detail,
      };
    }
  }

  private async checkInfluxQuery(): Promise<PreflightCheck> {
    const query = `from(bucket: "${this.config.influxdbBucket}")\n  |> range(start: -15m)\n  |> limit(n: 1)`;
    const org = encodeURIComponent(this.config.influxdbOrg);

    try {
      const response = await withTimeout(
        joinUrl(this.config.influxdbUrl, `/api/v2/query?org=${org}`),
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.config.influxdbToken}`,
            "Content-Type": "application/vnd.flux",
            Accept: "application/csv",
          },
          body: query,
        },
        5_000,
      );

      if (!response.ok) {
        return {
          name: "marine:influx-query",
          ok: false,
          detail: `Influx query failed with HTTP ${response.status}`,
        };
      }

      return {
        name: "marine:influx-query",
        ok: true,
        detail: `Query access confirmed for org=${this.config.influxdbOrg}, bucket=${this.config.influxdbBucket}`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        name: "marine:influx-query",
        ok: false,
        detail,
      };
    }
  }
}
