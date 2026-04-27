import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface VesselContextDocument {
  content: string;
  updatedAt: string | null;
}

export const DEFAULT_VESSEL_CONTEXT_TEMPLATE = `# My Vessel Systems

## Electrical
- Main battery: 300Ah LiFePO4, normal range 12.0-14.6V
- Solar: 400W bimini + 100W dodger (expect ~50% efficiency due to shading)
- SignalK paths:
  - Battery voltage: electrical.batteries.288.voltage
  - Battery SOC: electrical.batteries.288.capacity.stateOfCharge
  - Solar production: electrical.solar.289.yieldToday

## Normal Patterns
- Battery charges 7-9 AM (sunrise), reaches 100% by 9:30 AM
- Average power consumption: ~107W continuously
- Fridge cycles: 21W average, alarm threshold at >6°C

## Environmental
- Inside temp: 22-28°C typical
- Bilge: Both forward and aft normally dry
- SignalK paths:
  - Inside temp: environment.inside.temperature
  - Bilge status: environment.bilge.aft.flood

## Unit Conversions & Preferences
- Timezone: Pacific (PDT/PST) - SignalK and InfluxDB store times in UTC
- Temperature: Display in Fahrenheit (SignalK stores in Kelvin)
- Depth: Display in feet (SignalK stores in meters)
- Speed: Display in knots (SignalK stores in m/s)
- Distance: Use nautical miles for navigation (SignalK stores meters)
- Wind speed: Display in knots (SignalK stores m/s)

## SignalK Paths To Track
- Current depth:
- Current speed:
- Battery voltage:
- Battery SOC:

## Notes
- Add additional vessel-specific behavior, thresholds, and operating context here.
`;

export class VesselContextStore {
  constructor(private readonly filePath: string) {}

  async get(): Promise<VesselContextDocument> {
    await this.ensureParentDir();

    try {
      const content = await readFile(this.filePath, "utf8");
      const trimmed = content.trim();
      return {
        content: trimmed.length > 0 ? content : DEFAULT_VESSEL_CONTEXT_TEMPLATE,
        updatedAt: new Date().toISOString(),
      };
    } catch {
      await this.save(DEFAULT_VESSEL_CONTEXT_TEMPLATE);
      return {
        content: DEFAULT_VESSEL_CONTEXT_TEMPLATE,
        updatedAt: null,
      };
    }
  }

  async save(content: string): Promise<void> {
    await this.ensureParentDir();
    await writeFile(this.filePath, content, "utf8");
  }

  private async ensureParentDir(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
  }
}
