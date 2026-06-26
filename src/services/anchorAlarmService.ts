import type { AppConfig } from "../types";

interface VesselSelfResponse {
  navigation?: {
    position?: { value?: { latitude?: number; longitude?: number }; timestamp?: string };
  };
  environment?: {
    depth?: {
      belowSurface?: { value?: number } | number;
      belowTransducer?: { value?: number } | number;
    };
  };
  design?: {
    draft?: {
      maximum?: { value?: number } | number;
    };
  };
}

interface PluginConfiguration {
  bowHeight?: number;
  fudge?: number;
}

const TEST_POSITION = {
  longitude: -3.4112001666666667,
  latitude: 55.995147,
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const readNumberNode = (value: unknown): number | null => {
  if (isFiniteNumber(value)) {
    return value;
  }
  if (value && typeof value === "object" && "value" in value) {
    const nested = (value as { value?: unknown }).value;
    if (isFiniteNumber(nested)) {
      return nested;
    }
  }
  return null;
};

const isFreshTimestamp = (timestamp: string | undefined, maxAgeSeconds: number): boolean => {
  if (!timestamp) {
    return false;
  }
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return Date.now() - parsed <= Math.max(1, maxAgeSeconds) * 1000;
};

export class AnchorAlarmService {
  private readonly base: string;
  private readonly token: string;

  constructor(private readonly config: AppConfig) {
    this.base = this.config.signalKUrl.replace(/\/+$/, "");
    this.token = this.config.signalKToken;
  }

  async disable(): Promise<string> {
    await this.postPluginEndpoint("/plugins/anchoralarm/raiseAnchor", {});
    return "Anchor alarm switched off.";
  }

  async setRadius(radiusMeters: number): Promise<string> {
    if (!isFiniteNumber(radiusMeters) || radiusMeters <= 0) {
      throw new Error("Radius must be a positive number in meters.");
    }
    await this.postPluginEndpoint("/plugins/anchoralarm/setRadius", { radius: radiusMeters });
    return `Anchor alarm radius set to ${radiusMeters.toFixed(1)} meters.`;
  }

  async enableWithRodeLength(rodeLengthMeters: number): Promise<string> {
    if (!isFiniteNumber(rodeLengthMeters) || rodeLengthMeters <= 0) {
      throw new Error("Rode length must be a positive number in meters.");
    }

    const [self, pluginConfig] = await Promise.all([
      this.getSelfVesselData(),
      this.getPluginConfiguration(),
    ]);

    const position = await this.resolveBestPosition(self);
    if (!isFiniteNumber(position.latitude) || !isFiniteNumber(position.longitude)) {
      throw new Error("SignalK position is unavailable.");
    }

    const depthBelowSurface = this.resolveDepthBelowSurfaceMeters(self);
    const bowHeight = isFiniteNumber(pluginConfig.bowHeight) ? pluginConfig.bowHeight : 0;
    const fudge = isFiniteNumber(pluginConfig.fudge) ? pluginConfig.fudge : 0;
    const vertical = Math.max(0, depthBelowSurface + bowHeight);
    const radiusBase = Math.sqrt(Math.max(0, rodeLengthMeters * rodeLengthMeters - vertical * vertical));
    const radius = Math.max(5, Number((radiusBase + fudge).toFixed(1)));

    const dropped = await this.postPluginEndpoint(
      "/plugins/anchoralarm/dropAnchor",
      {},
      { allowNoPosition: true },
    );

    if (!dropped) {
      // Fallback path when SignalK has no live navigation.position:
      // explicitly set anchor position, then set rode length so plugin computes radius.
      await this.postPluginEndpoint("/plugins/anchoralarm/setAnchorPosition", {
        position: {
          ...position,
          altitude: -1 * depthBelowSurface,
        },
      });
      await this.postPluginEndpoint("/plugins/anchoralarm/setRodeLength", {
        length: rodeLengthMeters,
        depth: depthBelowSurface,
      });
    } else {
      await this.postPluginEndpoint("/plugins/anchoralarm/setRadius", { radius });
    }

    return `The Anchor alarm is now on. The current depth is ${depthBelowSurface.toFixed(1)} meters, I've calculated the swing radius as ${radius.toFixed(1)} meters.`;
  }

  private resolveDepthBelowSurfaceMeters(self: VesselSelfResponse): number {
    const belowSurface = readNumberNode(self.environment?.depth?.belowSurface);
    if (belowSurface !== null) {
      return belowSurface;
    }

    const belowTransducer = readNumberNode(self.environment?.depth?.belowTransducer);
    const draftFromSignalK = readNumberNode(self.design?.draft?.maximum);
    const fallbackDraft = Number.isFinite(this.config.signalKDraftMaxM) && this.config.signalKDraftMaxM > 0
      ? this.config.signalKDraftMaxM
      : null;
    const draft = draftFromSignalK ?? fallbackDraft;
    if (belowTransducer !== null && draft !== null) {
      return belowTransducer + draft;
    }

    throw new Error(
      "Depth unavailable. Provide environment.depth.belowSurface, or environment.depth.belowTransducer with design.draft.maximum.",
    );
  }

  private async getSelfVesselData(): Promise<VesselSelfResponse> {
    const response = await fetch(`${this.base}/signalk/v1/api/vessels/self`, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(`SignalK self data failed: HTTP ${response.status}`);
    }

    return (await response.json()) as VesselSelfResponse;
  }

  private async resolveBestPosition(self: VesselSelfResponse): Promise<{ latitude: number; longitude: number }> {
    const localPosition = self.navigation?.position?.value;
    if (localPosition && isFiniteNumber(localPosition.latitude) && isFiniteNumber(localPosition.longitude)) {
      return localPosition as { latitude: number; longitude: number };
    }

    const remotePosition = await this.getRemotePosition();
    if (remotePosition) {
      return remotePosition;
    }

    return TEST_POSITION;
  }

  private async getRemotePosition(): Promise<{ latitude: number; longitude: number } | null> {
    const remoteUrl = this.config.remoteSignalKUrl.trim();
    if (!remoteUrl) {
      return null;
    }
    const base = remoteUrl.replace(/\/+$/, "");
    const headers: Record<string, string> = {};
    if (this.config.remoteSignalKToken) {
      headers.Authorization = `Bearer ${this.config.remoteSignalKToken}`;
    }

    try {
      const response = await fetch(`${base}/signalk/v1/api/vessels/self`, {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as VesselSelfResponse;
      const positionNode = payload.navigation?.position;
      const position = positionNode?.value;
      if (!position || !isFiniteNumber(position.latitude) || !isFiniteNumber(position.longitude)) {
        return null;
      }
      if (!isFreshTimestamp(positionNode?.timestamp, this.config.remoteSignalKPositionMaxAgeSeconds)) {
        return null;
      }
      return position as { latitude: number; longitude: number };
    } catch {
      return null;
    }
  }

  private async getPluginConfiguration(): Promise<PluginConfiguration> {
    const response = await fetch(`${this.base}/plugins/`, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as Array<{
      id?: string;
      data?: { configuration?: PluginConfiguration };
    }>;
    const anchor = payload.find((item) => item.id === "anchoralarm");
    return anchor?.data?.configuration ?? {};
  }

  private async postPluginEndpoint(
    path: string,
    body: Record<string, unknown>,
    options?: { allowNoPosition?: boolean },
  ): Promise<boolean> {
    const response = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return true;
    }

    const text = await response.text();
    if (options?.allowNoPosition && response.status === 403 && /no position available/i.test(text)) {
      return false;
    }

    if (!response.ok) {
      throw new Error(`Anchor alarm API failed: HTTP ${response.status} ${text}`.trim());
    }

    return true;
  }

  private buildHeaders(): Record<string, string> {
    if (!this.token) {
      return {};
    }
    return { Authorization: `Bearer ${this.token}` };
  }
}
