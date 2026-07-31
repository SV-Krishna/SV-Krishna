import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config";
import { ControllerApp } from "../controller";

const buildController = (): ControllerApp => {
  const config = loadConfig();
  config.marineTelemetryEnabled = true;
  config.signalKUrl = "http://signalk.local";
  config.signalKToken = "";
  config.enableRasaIntentRouter = false;
  config.enableTranscribingCue = false;
  config.reSpeakerLedEnabled = false;
  config.reSpeakerXvfEnabled = false;
  config.wakeWordPhrase = "Hey Krishna";
  return new ControllerApp(config);
};

test("executeTelemetryQuery returns formatted leisure battery SOC", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        electrical: {
          batteries: {
            A: { capacity: { stateOfCharge: { value: 0.73 } } },
          },
        },
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const controller = buildController();
    const reply = await controller.executeTelemetryQuery("Tell me the state of charge of the leisure battery");
    assert.equal(reply, "Leisure battery state of charge is 73.0 percent.");
  } finally {
    global.fetch = originalFetch;
  }
});

test("executeTelemetryQuery returns null for non-telemetry text", async () => {
  const controller = buildController();
  const reply = await controller.executeTelemetryQuery("switch on anchor alarm");
  assert.equal(reply, null);
});

test("executeTelemetryQuery returns status report with active alerts and anchor on", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        notifications: {
          environment: {
            depth: {
              belowTransducer: {
                $source: "self.notificationhandler",
                value: { state: "emergency", message: "Warning - Shallow Depth" },
              },
            },
          },
          navigation: {
            anchor: {
              value: { state: "normal" },
            },
          },
        },
        navigation: {
          anchor: {
            position: { latitude: 55.99, longitude: -3.41 },
            maxRadius: 14.3,
          },
        },
        environment: {
          wind: { speedApparent: 3.2 },
          depth: { belowTransducer: 6.4 },
        },
        electrical: {
          batteries: {
            A: { capacity: { stateOfCharge: 0.91 } },
            B: { capacity: { stateOfCharge: 0.84 } },
          },
        },
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const controller = buildController();
    const reply = await controller.executeTelemetryQuery("status report");
    assert.ok(reply);
    assert.match(reply!, /alert which says/i);
    assert.match(reply!, /Warning - Shallow Depth/i);
    assert.match(reply!, /Anchor alarm is on/i);
    assert.match(reply!, /Apparent wind is around 3.20 meters per second/i);
    assert.match(reply!, /leisure battery at 91.0 percent/i);
    assert.match(reply!, /starter battery at 84.0 percent/i);
    assert.match(reply!, /Current depth is 6.4 meters/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("executeAnchorAlarmCommand accepts rode length on follow-up turn", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/signalk/v1/api/vessels/self")) {
      return new Response(
        JSON.stringify({
          navigation: {
            position: {
              value: { latitude: 55.99, longitude: -3.41 },
              timestamp: new Date().toISOString(),
            },
          },
          environment: {
            depth: {
              belowSurface: { value: 6.4 },
            },
          },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/plugins/")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.endsWith("/plugins/anchoralarm/dropAnchor")) {
      return new Response("ok", { status: 200 });
    }
    if (url.endsWith("/plugins/anchoralarm/setRadius")) {
      return new Response("ok", { status: 200 });
    }
    assert.fail(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;

  try {
    const controller = buildController();
    const prompt = await controller.executeAnchorAlarmCommand("switch on anchor alarm");
    assert.equal(prompt, "Anchor alarm acknowledged. What rode length has been deployed in meters?");

    const reply = await controller.executeAnchorAlarmCommand("20 meters");
    assert.match(reply!, /Anchor alarm is now on/i);
    assert.match(reply!, /current depth is 6.4 meters/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("anchor activation fails closed when local and remote position are unavailable", async () => {
  const originalFetch = global.fetch;
  let writeAttempted = false;
  global.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/signalk/v1/api/vessels/self")) {
      return new Response(JSON.stringify({
        environment: { depth: { belowSurface: { value: 3 } } },
      }), { status: 200 });
    }
    if (init?.method === "POST") writeAttempted = true;
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;

  try {
    const controller = buildController();
    await assert.rejects(
      controller.executeAnchorAlarmCommand("switch on anchor alarm 15 meters"),
      /position is unavailable or stale/i,
    );
    assert.equal(writeAttempted, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("runVoiceOnce accepts a bare numeric rode-length follow-up", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/signalk/v1/api/vessels/self")) {
      return new Response(
        JSON.stringify({
          navigation: {
            position: {
              value: { latitude: 55.99, longitude: -3.41 },
              timestamp: new Date().toISOString(),
            },
          },
          environment: {
            depth: {
              belowSurface: { value: 6.4 },
            },
          },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/plugins/")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.endsWith("/plugins/anchoralarm/dropAnchor")) {
      return new Response("ok", { status: 200 });
    }
    if (url.endsWith("/plugins/anchoralarm/setRadius")) {
      return new Response("ok", { status: 200 });
    }
    assert.fail(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;

  try {
    const controller = buildController();
    const app = controller as any;

    let recordings = 0;
    app.refreshServiceHealth = async () => [
      { name: "whisper", enabled: true, ok: true, detail: "ok" },
      { name: "rasa", enabled: true, ok: true, detail: "ok" },
    ];
    app.audio.recordSample = async () => `sample-${++recordings}.wav`;
    app.whisper.transcribe = async (path: string) =>
      path.endsWith("1.wav") ? "switch on anchor alarm" : "20";

    const result = await controller.runVoiceOnce({ wakeTriggered: true });

    assert.equal(recordings, 2);
    assert.equal(result.transcript, "20");
    assert.equal(result.reply?.includes("Anchor alarm is now on"), true);
    assert.equal(result.reply?.includes("current depth is 6.4 meters"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("runVoiceOnce bypasses VAD for rode-length follow-up capture", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/signalk/v1/api/vessels/self")) {
      return new Response(
        JSON.stringify({
          navigation: {
            position: {
              value: { latitude: 55.99, longitude: -3.41 },
              timestamp: new Date().toISOString(),
            },
          },
          environment: {
            depth: {
              belowSurface: { value: 6.4 },
            },
          },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/plugins/")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.endsWith("/plugins/anchoralarm/dropAnchor")) {
      return new Response("ok", { status: 200 });
    }
    if (url.endsWith("/plugins/anchoralarm/setRadius")) {
      return new Response("ok", { status: 200 });
    }
    assert.fail(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;

  try {
    const controller = buildController();
    const app = controller as any;

    const recordOptions: Array<{ disableVad?: boolean } | undefined> = [];
    let recordings = 0;
    app.refreshServiceHealth = async () => [
      { name: "whisper", enabled: true, ok: true, detail: "ok" },
      { name: "rasa", enabled: true, ok: true, detail: "ok" },
    ];
    app.audio.recordSample = async (options?: { disableVad?: boolean }) => {
      recordOptions.push(options);
      return `sample-${++recordings}.wav`;
    };
    app.whisper.transcribe = async (path: string) =>
      path.endsWith("1.wav") ? "switch on anchor alarm" : "20";

    await controller.runVoiceOnce({ wakeTriggered: true });

    assert.equal(recordings, 2);
    assert.equal(recordOptions[0], undefined);
    assert.deepEqual(recordOptions[1], { disableVad: true });
  } finally {
    global.fetch = originalFetch;
  }
});

test("executeTelemetryQuery supports generic routed prompts", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        electrical: {
          batteries: {
            A: { voltage: { value: 12.64 } },
            B: { capacity: { stateOfCharge: { value: 0.84 } } },
          },
        },
        environment: {
          inside: {
            temperature: { value: 18.2 },
            engineBay: {
              relativeHumidity: { value: 0.61 },
            },
          },
          wind: {
            speedApparent: { value: 3.4 },
          },
        },
        navigation: {
          datetime: { value: "2026-06-24T19:00:00Z" },
          speedOverGround: { value: 2.7 },
          anchor: {
            position: { latitude: 55.99, longitude: -3.41 },
            maxRadius: 14.3,
          },
        },
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const controller = buildController();
    assert.equal(await controller.executeTelemetryQuery("what is our current battery voltage"), "Battery voltage is 12.64 volts.");
    assert.equal(await controller.executeTelemetryQuery("what is the cabin temperature"), "Cabin temperature is 18.2 celsius.");
    assert.equal(await controller.executeTelemetryQuery("what is our current wind speed"), "Current wind speed is 3.40 meters per second.");
    assert.equal(await controller.executeTelemetryQuery("what is our current speed"), "Current speed is 2.70 meters per second.");
    assert.equal(await controller.executeTelemetryQuery("tell me todays date"), "Today's date is 2026-06-24T19:00:00Z.");
    assert.match((await controller.executeTelemetryQuery("what is the anchor alarm status"))!, /Anchor alarm is on/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("normalizeTranscriptWithRasa applies deterministic aliases for short commands", async () => {
  const controller = buildController();
  const app = controller as any;
  app.rasa = { parse: async () => null };

  assert.equal(await app.normalizeTranscriptWithRasa("relay 1"), "turn relay 1 on");
  assert.equal(await app.normalizeTranscriptWithRasa("current speed"), "what is our current speed");
  assert.equal(await app.normalizeTranscriptWithRasa("wind speed"), "what is our current wind speed");
  assert.equal(await app.normalizeTranscriptWithRasa("battery voltage"), "what is our current battery voltage");
  assert.equal(await app.normalizeTranscriptWithRasa("starter battery"), "tell me the state of charge of the starter battery");
  assert.equal(await app.normalizeTranscriptWithRasa("cabin temperature"), "what is the cabin temperature");
  assert.equal(await app.normalizeTranscriptWithRasa("anchor alarm"), "what is the anchor alarm status");
  assert.equal(await app.normalizeTranscriptWithRasa("today's date"), "tell me todays date");
});

test("execute signalk alert monitor command toggles and reports status", async () => {
  const controller = buildController();

  assert.equal(await (controller as any).tryHandleSignalKAlertMonitorCommand("what is the signalk notification status"), "Signal K notifications are disabled.");
  assert.equal(await controller.runTextCommand("enable signalk notifications").then((result) => result.reply), "Signal K notifications are now enabled.");
  assert.equal(await (controller as any).tryHandleSignalKAlertMonitorCommand("what is the signalk notification status"), "Signal K notifications are enabled.");
  assert.equal(await controller.runTextCommand("disable signalk notifications").then((result) => result.reply), "Signal K notifications are now disabled.");
});

test("execute signalk alert monitor snooze command snoozes active alerts", async () => {
  const controller = buildController();
  (controller as any).signalkAlertMonitor = {
    snoozeActiveAlerts: () => [{ path: "environment.depth.belowTransducer", message: "Warning shallow depth." }],
  };

  assert.equal(
    await controller.runTextCommand("snooze that notification").then((result) => result.reply),
    "Snoozed that Signal K notification for 5 minutes.",
  );
});

test("execute signalk alert monitor snooze command reports when nothing is active", async () => {
  const controller = buildController();
  (controller as any).signalkAlertMonitor = {
    snoozeActiveAlerts: () => [],
  };

  assert.equal(
    await controller.runTextCommand("snooze that notification").then((result) => result.reply),
    "There are no active Signal K notifications to snooze right now.",
  );
});

test("mapRasaIntentToPrompt routes signalk notification intents", async () => {
  const controller = buildController();
  const app = controller as any;
  app.rasa = {
    parse: async () => ({ intentName: "signalk_notifications_on", confidence: 0.99, entities: [] }),
  };
  assert.equal(await app.normalizeTranscriptWithRasa("turn the signalk notifications on"), "enable signalk notifications");

  app.rasa = {
    parse: async () => ({ intentName: "signalk_notifications_off", confidence: 0.99, entities: [] }),
  };
  assert.equal(await app.normalizeTranscriptWithRasa("disable signalk alerts"), "disable signalk notifications");

  app.rasa = {
    parse: async () => ({ intentName: "signalk_notifications_status", confidence: 0.99, entities: [] }),
  };
  assert.equal(await app.normalizeTranscriptWithRasa("are signalk notifications enabled"), "what is the signalk notification status");

  app.rasa = {
    parse: async () => ({ intentName: "signalk_notifications_snooze", confidence: 0.99, entities: [] }),
  };
  assert.equal(await app.normalizeTranscriptWithRasa("snooze active notifications"), "snooze active notifications");
});

test("normalizeTranscriptWithRasa preserves snooze phrasing when Rasa misclassifies it as notifications on", async () => {
  const controller = buildController();
  const app = controller as any;
  app.rasa = {
    parse: async () => ({ intentName: "signalk_notifications_on", confidence: 0.99, entities: [] }),
  };

  assert.equal(await app.normalizeTranscriptWithRasa("snooze notifications"), "snooze notifications");
  assert.equal(await app.normalizeTranscriptWithRasa("snooze active notifications"), "snooze active notifications");
});

test("runVoiceOnce retries a filler transcript after wake-word detection", async () => {
  const controller = buildController();
  const app = controller as any;

  let recordings = 0;
  app.refreshServiceHealth = async () => [
    { name: "whisper", enabled: true, ok: true, detail: "ok" },
    { name: "rasa", enabled: true, ok: true, detail: "ok" },
  ];
  app.audio.recordSample = async () => `sample-${++recordings}.wav`;
  app.whisper.transcribe = async (path: string) =>
    path.endsWith("1.wav") ? "Okay." : "what is our current depth";
  controller.executeTelemetryQuery = async (prompt: string) =>
    prompt === "what is our current depth" ? "Depth is 5.4 meters." : null;

  const result = await controller.runVoiceOnce({ wakeTriggered: true });

  assert.equal(recordings, 2);
  assert.equal(result.transcript, "what is our current depth");
  assert.equal(result.normalizedTranscript, "what is our current depth");
  assert.equal(result.reply, "Depth is 5.4 meters.");
});

test("runVoiceOnce returns clarification when wake-word retry also captures filler", async () => {
  const controller = buildController();
  const app = controller as any;

  let recordings = 0;
  app.refreshServiceHealth = async () => [
    { name: "whisper", enabled: true, ok: true, detail: "ok" },
    { name: "rasa", enabled: true, ok: true, detail: "ok" },
  ];
  app.audio.recordSample = async () => `sample-${++recordings}.wav`;
  app.whisper.transcribe = async (path: string) =>
    path.endsWith("1.wav") ? "Okay." : "yeah";
  controller.executeTelemetryQuery = async () => null;

  const result = await controller.runVoiceOnce({ wakeTriggered: true });

  assert.equal(recordings, 2);
  assert.equal(result.normalizedTranscript, null);
  assert.match(result.reply ?? "", /I heard Hey Krishna, but I still need your command/i);
});

test("runVoiceOnce uses provided wake-word recording path without starting a new recording", async () => {
  const controller = buildController();
  const app = controller as any;

  let recordCalls = 0;

  app.refreshServiceHealth = async () => [
    { name: "whisper", enabled: true, ok: true, detail: "ok" },
    { name: "rasa", enabled: true, ok: true, detail: "ok" },
  ];
  app.audio.recordSample = async () => {
    recordCalls += 1;
    return `sample-${recordCalls}.wav`;
  };
  app.whisper.transcribe = async (path: string) =>
    path === "/tmp/wake-buffer.wav" ? "current depth" : "unexpected";
  controller.executeTelemetryQuery = async (prompt: string) =>
    prompt === "what is our current depth" || prompt === "current depth" ? "Depth is 5.4 meters." : null;

  const result = await controller.runVoiceOnce({
    wakeTriggered: true,
    recordingPath: "/tmp/wake-buffer.wav",
  });

  assert.equal(recordCalls, 0);
  assert.equal(result.transcript, "current depth");
  assert.equal(result.reply, "Depth is 5.4 meters.");
});

test("runVoiceOnce plays and stops the transcribing cue without blocking transcription", async () => {
  const controller = buildController();
  const app = controller as any;

  const cueCalls: string[] = [];

  app.refreshServiceHealth = async () => [
    { name: "whisper", enabled: true, ok: true, detail: "ok" },
    { name: "rasa", enabled: true, ok: true, detail: "ok" },
  ];
  app.audioCue = {
    playTranscribingCue: async () => {
      cueCalls.push("play");
    },
    stop: async () => {
      cueCalls.push("stop");
    },
  };
  app.whisper.transcribe = async () => "current depth";
  controller.executeTelemetryQuery = async (prompt: string) =>
    prompt === "current depth" ? "Depth is 5.4 meters." : null;

  const result = await controller.runVoiceOnce({
    wakeTriggered: true,
    recordingPath: "/tmp/wake-buffer.wav",
  });

  assert.equal(result.reply, "Depth is 5.4 meters.");
  assert.deepEqual(cueCalls, ["play", "stop"]);
});

test("runVoiceOnce strips a leading wake word from wake-triggered transcripts", async () => {
  const controller = buildController();
  const app = controller as any;

  app.refreshServiceHealth = async () => [
    { name: "whisper", enabled: true, ok: true, detail: "ok" },
    { name: "rasa", enabled: true, ok: true, detail: "ok" },
  ];
  app.whisper.transcribe = async () => "Krishna, what is our current speed?";
  controller.executeTelemetryQuery = async (prompt: string) =>
    prompt === "what is our current speed?" ? "Speed over ground is 4.8 knots." : null;

  const result = await controller.runVoiceOnce({
    wakeTriggered: true,
    recordingPath: "/tmp/wake-buffer.wav",
  });

  assert.equal(result.transcript, "what is our current speed?");
  assert.equal(result.normalizedTranscript, "what is our current speed?");
  assert.equal(result.reply, "Speed over ground is 4.8 knots.");
});

test("runVoiceOnce strips a wake-word mishear prefix from wake-triggered transcripts", async () => {
  const controller = buildController();
  const app = controller as any;

  app.refreshServiceHealth = async () => [
    { name: "whisper", enabled: true, ok: true, detail: "ok" },
    { name: "rasa", enabled: true, ok: true, detail: "ok" },
  ];
  app.whisper.transcribe = async () => "Prichman, what is our current speed?";
  controller.executeTelemetryQuery = async (prompt: string) =>
    prompt === "what is our current speed?" ? "Speed over ground is 4.8 knots." : null;

  const result = await controller.runVoiceOnce({
    wakeTriggered: true,
    recordingPath: "/tmp/wake-buffer.wav",
  });

  assert.equal(result.transcript, "what is our current speed?");
  assert.equal(result.normalizedTranscript, "what is our current speed?");
  assert.equal(result.reply, "Speed over ground is 4.8 knots.");
});

test("runVoiceOnce strips a multi-word wake-word mishear prefix from wake-triggered transcripts", async () => {
  const controller = buildController();
  const app = controller as any;

  app.wakeWordPhrase = "Hey Krishna";
  app.refreshServiceHealth = async () => [
    { name: "whisper", enabled: true, ok: true, detail: "ok" },
    { name: "rasa", enabled: true, ok: true, detail: "ok" },
  ];
  app.whisper.transcribe = async () => "Hey Christian, what is our current speed?";
  controller.executeTelemetryQuery = async (prompt: string) =>
    prompt === "what is our current speed?" ? "Speed over ground is 4.8 knots." : null;

  const result = await controller.runVoiceOnce({
    wakeTriggered: true,
    recordingPath: "/tmp/wake-buffer.wav",
  });

  assert.equal(result.transcript, "what is our current speed?");
  assert.equal(result.normalizedTranscript, "what is our current speed?");
  assert.equal(result.reply, "Speed over ground is 4.8 knots.");
});

test("runTextCommand returns deterministic fallback when no Rasa-mapped action matches", async () => {
  const controller = buildController();
  const result = await controller.runTextCommand("compose a poem about the marina");

  assert.equal(result.transcript, "compose a poem about the marina");
  assert.equal(result.reply, "I can't help with that yet. Try a relay, telemetry, or anchor-alarm command.");
  assert.equal(result.relay.kind, "none");
});

test("handleWakeWordDetected sets listening immediately on wake detection", async () => {
  const controller = buildController();
  const app = controller as any;

  app.wakeWordEnabled = true;
  let state: string | null = null;
  let message: string | null = null;
  let productionCalled = false;

  app.setState = (nextState: string, nextMessage: string) => {
    state = nextState;
    message = nextMessage;
  };
  app.runVoiceOnce = async () => {
    productionCalled = true;
    return { transcript: null, normalizedTranscript: null, reply: null, relay: { kind: "none" } };
  };

  await app.handleWakeWordDetected({
    event: "wake-detected",
    phrase: "Krishna",
    score: 0.9,
  });

  assert.equal(state, "listening");
  assert.match(message ?? "", /Wake word heard/i);
  assert.equal(productionCalled, false);
});

test("handleWakeWordDetected routes captured wake-word audio through the production voice path", async () => {
  const controller = buildController();
  const app = controller as any;

  app.wakeWordEnabled = true;

  let productionCalled = false;
  let stopAndWaitCalled = false;
  let syncCalled = false;

  app.runVoiceOnce = async (options: { wakeTriggered?: boolean; recordingPath?: string }) => {
    productionCalled = options.wakeTriggered === true && options.recordingPath === "/tmp/wake.wav";
    return { transcript: null, normalizedTranscript: null, reply: null, relay: { kind: "none" } };
  };
  app.wakeWordService.stopAndWait = async () => {
    stopAndWaitCalled = true;
  };
  app.syncWakeWordRuntime = async () => {
    syncCalled = true;
  };

  await app.handleWakeWordDetected({
    event: "wake-captured",
    phrase: "Krishna",
    score: 0.9,
    filePath: "/tmp/wake.wav",
  });

  assert.equal(productionCalled, true);
  assert.equal(stopAndWaitCalled, true);
  assert.equal(syncCalled, true);
});

test("handleWakeWordDetected restores idle state when wake-triggered run fails", async () => {
  const controller = buildController();
  const app = controller as any;

  app.wakeWordEnabled = true;

  let state: string | null = null;
  let message: string | null = null;

  app.setState = (nextState: string, nextMessage: string) => {
    state = nextState;
    message = nextMessage;
  };
  app.runVoiceOnce = async () => {
    throw new Error("aplay failed");
  };
  app.wakeWordService.stopAndWait = async () => {};
  app.syncWakeWordRuntime = async () => {};

  await app.handleWakeWordDetected({
    event: "wake-captured",
    phrase: "Krishna",
    score: 0.9,
    filePath: "/tmp/wake.wav",
  });

  assert.equal(state, "idle");
  assert.match(message ?? "", /unable to do that right now/i);
});
