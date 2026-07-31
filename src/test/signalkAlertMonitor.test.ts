import test from "node:test";
import assert from "node:assert/strict";
import { extractSpokenSignalKAlerts, SignalKAlertMonitor } from "../services/signalkAlertMonitor";
import { loadConfig } from "../config";

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
      state: "alarm",
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

test("SignalKAlertMonitor throttles repeated alerts by warning type rather than message text", async () => {
  const originalFetch = global.fetch;
  const payloads = [
    {
      environment: {
        depth: {
          belowTransducer: {
            value: 4.5,
          },
        },
      },
      notifications: {
        environment: {
          depth: {
            belowTransducer: {
              state: "alarm",
              message: "Shallow depth warning",
            },
          },
        },
      },
    },
    {
      environment: {
        depth: {
          belowTransducer: {
            value: 4.3,
          },
        },
      },
      notifications: {
        environment: {
          depth: {
            belowTransducer: {
              state: "alarm",
              message: "Shallow depth warning",
            },
          },
        },
      },
    },
  ];

  global.fetch = (async () =>
    new Response(JSON.stringify(payloads.shift() ?? payloads[0]), { status: 200 })) as typeof fetch;

  try {
    const config = loadConfig();
    config.signalKUrl = "http://signalk.local";
    config.signalkAlertMonitorEnabled = true;
    config.signalkAlertRepeatSeconds = 30;
    const spoken: string[] = [];
    const monitor = new SignalKAlertMonitor(config, async (alert) => {
      spoken.push(alert.message);
    });

    await (monitor as any).pollOnce();
    await (monitor as any).pollOnce();

    assert.deepEqual(spoken, ["Warning shallow depth. Depth currently 4.5 meters."]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("SignalKAlertMonitor snoozes currently active alerts without affecting different alert types", async () => {
  const originalFetch = global.fetch;
  const payloads = [
    {
      environment: {
        depth: {
          belowTransducer: {
            value: 4.5,
          },
        },
      },
      notifications: {
        environment: {
          depth: {
            belowTransducer: {
              state: "alarm",
              message: "Shallow depth warning",
            },
          },
        },
      },
    },
    {
      environment: {
        depth: {
          belowTransducer: {
            value: 4.2,
          },
        },
      },
      notifications: {
        environment: {
          depth: {
            belowTransducer: {
              state: "alarm",
              message: "Shallow depth warning",
            },
          },
        },
        navigation: {
          anchor: {
            state: "alarm",
            message: "Anchor drag warning",
          },
        },
      },
    },
  ];

  global.fetch = (async () =>
    new Response(JSON.stringify(payloads.shift() ?? payloads[0]), { status: 200 })) as typeof fetch;

  try {
    const config = loadConfig();
    config.signalKUrl = "http://signalk.local";
    config.signalkAlertMonitorEnabled = true;
    config.signalkAlertRepeatSeconds = 30;
    config.signalkAlertSnoozeSeconds = 300;
    config.signalkAlertPaths = [
      "notifications.environment.depth.belowTransducer",
      "notifications.navigation.anchor",
    ];
    const spoken: string[] = [];
    const monitor = new SignalKAlertMonitor(config, async (alert) => {
      spoken.push(`${alert.path}:${alert.message}`);
    });

    await (monitor as any).pollOnce();
    const snoozed = monitor.snoozeActiveAlerts();
    await (monitor as any).pollOnce();

    assert.equal(snoozed.length, 1);
    assert.deepEqual(spoken, [
      "environment.depth.belowTransducer:Warning shallow depth. Depth currently 4.5 meters.",
      "navigation.anchor:Anchor drag warning",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("SignalKAlertMonitor overrides cooldown when alert severity increases", async () => {
  const originalFetch = global.fetch;
  const payloads = [
    {
      notifications: {
        navigation: {
          anchor: {
            state: "warn",
            message: "Anchor drag warning",
          },
        },
      },
    },
    {
      notifications: {
        navigation: {
          anchor: {
            state: "emergency",
            message: "Anchor drag emergency",
          },
        },
      },
    },
  ];

  global.fetch = (async () =>
    new Response(JSON.stringify(payloads.shift() ?? payloads[0]), { status: 200 })) as typeof fetch;

  try {
    const config = loadConfig();
    config.signalKUrl = "http://signalk.local";
    config.signalkAlertMonitorEnabled = true;
    config.signalkAlertRepeatSeconds = 30;
    config.signalkAlertPaths = ["notifications.navigation.anchor"];
    const spoken: string[] = [];
    const monitor = new SignalKAlertMonitor(config, async (alert) => {
      spoken.push(`${alert.state}:${alert.message}`);
    });

    await (monitor as any).pollOnce();
    await (monitor as any).pollOnce();

    assert.deepEqual(spoken, [
      "warn:Anchor drag warning",
      "emergency:Anchor drag emergency",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("SignalKAlertMonitor overrides snooze when alert severity increases", async () => {
  const originalFetch = global.fetch;
  const payloads = [
    {
      notifications: {
        navigation: {
          anchor: {
            state: "warn",
            message: "Anchor drag warning",
          },
        },
      },
    },
    {
      notifications: {
        navigation: {
          anchor: {
            state: "alarm",
            message: "Anchor drag alarm",
          },
        },
      },
    },
  ];

  global.fetch = (async () =>
    new Response(JSON.stringify(payloads.shift() ?? payloads[0]), { status: 200 })) as typeof fetch;

  try {
    const config = loadConfig();
    config.signalKUrl = "http://signalk.local";
    config.signalkAlertMonitorEnabled = true;
    config.signalkAlertRepeatSeconds = 30;
    config.signalkAlertSnoozeSeconds = 300;
    config.signalkAlertPaths = ["notifications.navigation.anchor"];
    const spoken: string[] = [];
    const monitor = new SignalKAlertMonitor(config, async (alert) => {
      spoken.push(`${alert.state}:${alert.message}`);
    });

    await (monitor as any).pollOnce();
    const snoozed = monitor.snoozeActiveAlerts();
    await (monitor as any).pollOnce();

    assert.equal(snoozed.length, 1);
    assert.deepEqual(spoken, [
      "warn:Anchor drag warning",
      "alarm:Anchor drag alarm",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
