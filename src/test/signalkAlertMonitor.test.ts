import test from "node:test";
import assert from "node:assert/strict";
import { extractSpokenSignalKAlerts } from "../services/signalkAlertMonitor";

test("extractSpokenSignalKAlerts returns active alert message for configured path", () => {
  const payload = {
    environment: {
      depth: {
        belowTransducer: {
          value: 19.84,
        },
      },
    },
    notifications: {
      environment: {
        depth: {
          belowTransducer: {
            state: "alarm",
            message: "Shallow water warning. Depth below 20 meters.",
          },
        },
      },
    },
  };

  const alerts = extractSpokenSignalKAlerts(payload, ["notifications.environment.depth.belowTransducer"]);
  assert.deepEqual(alerts, [
    {
      path: "environment.depth.belowTransducer",
      message: "Warning shallow depth. Depth currently 19.8 meters.",
    },
  ]);
});

test("extractSpokenSignalKAlerts ignores non-active state", () => {
  const payload = {
    notifications: {
      environment: {
        depth: {
          belowTransducer: {
            state: "normal",
            message: "Depth is safe.",
          },
        },
      },
    },
  };

  const alerts = extractSpokenSignalKAlerts(payload, ["environment.depth.belowTransducer"]);
  assert.equal(alerts.length, 0);
});
