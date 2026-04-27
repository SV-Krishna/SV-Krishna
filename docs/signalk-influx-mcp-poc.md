# SignalK + Influx + MCP PoC Runbook

This runbook implements the SV-Krishna marine telemetry PoC architecture:

`SignalK -> InfluxDB -> MCP servers -> SV-Krishna orchestrator -> Gemma (Ollama)`

Scope for this pass:

- deploy scaffold for SignalK + InfluxDB
- deploy scaffold for InfluxDB MCP as a sidecar
- documented wiring for SignalK MCP in stdio mode
- repeatable preflight checks
- SV-Krishna MCP orchestration loop (feature-gated)

Non-goals for this pass:

- no direct relay/control coupling
- no assumption of internet access on boat network

## Runtime integration status

SV-Krishna now includes a feature-gated marine MCP loop:

1. Detect likely marine telemetry prompts.
2. Ask Gemma to produce a structured tool-call plan.
3. Execute MCP tool calls against SignalK/Influx sidecars.
4. Ask Gemma to synthesize the final response from tool results.

Enable with:

```bash
MARINE_TELEMETRY_ENABLED=true
```

Relevant env vars are in `.env.template` (`SIGNALK_MCP_*`, `INFLUXDB_MCP_*`, `MARINE_MCP_*`).

## 1. Bring up SignalK + InfluxDB (isolated PoC)

1. Copy env template.

```bash
cp deploy/compose/signalk-influx-poc.env.template deploy/compose/signalk-influx-poc.env
```

2. Edit `deploy/compose/signalk-influx-poc.env` and replace all placeholder secrets.
If ports `3000` or `8086` are already in use, change `SIGNALK_HOST_PORT` and `INFLUXDB_HOST_PORT`.

3. Start services.

```bash
docker compose \
  --env-file deploy/compose/signalk-influx-poc.env \
  -f deploy/compose/signalk-influx-poc.compose.yaml \
  up -d
```

4. Confirm services are up.

```bash
docker compose -f deploy/compose/signalk-influx-poc.compose.yaml ps
curl -fsS http://127.0.0.1:3000/signalk/v1/api/ >/dev/null
curl -fsS http://127.0.0.1:8086/health >/dev/null
```

If you changed host ports, update these URLs accordingly.

## 2. Configure SignalK to write to InfluxDB

1. Open SignalK Admin UI at `http://<host>:3000`.
2. Install plugin `signalk-to-influxdb2` from App Store.
3. Configure plugin with:
- Influx URL: `http://influxdb:8086` (if plugin runs in same Docker network) or host URL
- org: from InfluxDB bootstrap env
- bucket: from InfluxDB bootstrap env
- token: write-capable token
4. Restart SignalK and verify points appear in InfluxDB bucket.

Note: keep separate tokens for write (SignalK plugin) and read (MCP query access).

### Create a read-only Influx token for MCP

Use the helper script:

```bash
INFLUXDB_URL=http://127.0.0.1:8086 \
INFLUXDB_ADMIN_TOKEN=<admin-token> \
INFLUXDB_ORG=svkrishna \
INFLUXDB_BUCKET=signalk \
./deploy/scripts/create-influx-read-token.sh
```

Copy the returned `INFLUXDB_TOKEN` value into:

- `/opt/svkrishna/config/marine.env`
- or local `.env` for PoC tests

## 3. MCP sidecar choices

### SignalK MCP server

`signalk-mcp-server` currently runs on stdio transport in its published flow. Treat it as a child process started by the MCP client runtime (SV-Krishna when implemented).

Recommended launch command for client-managed process:

```bash
SIGNALK_HOST=127.0.0.1 \
SIGNALK_PORT=3000 \
SIGNALK_TLS=false \
EXECUTION_MODE=code \
npx -y signalk-mcp-server
```

### InfluxDB MCP server

`influxdb-mcp-server` supports both stdio and streamable HTTP. For PoC operations, HTTP mode is practical for service management and health checks.

Systemd unit template:

- `deploy/systemd/influxdb-mcp-server.service`

Environment template:

- `deploy/systemd/svkrishna-marine.env.template`

## 4. Install InfluxDB MCP sidecar via systemd (optional)

1. Copy files to target paths.

```bash
sudo cp deploy/systemd/influxdb-mcp-server.service /etc/systemd/system/
sudo mkdir -p /opt/svkrishna/config
sudo cp deploy/systemd/svkrishna-marine.env.template /opt/svkrishna/config/marine.env
```

2. Edit `/opt/svkrishna/config/marine.env` with real token/org/url values.

3. Start service.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now influxdb-mcp-server.service
sudo systemctl status influxdb-mcp-server.service
```

4. Validate endpoint.

```bash
curl -i http://127.0.0.1:8042/mcp || true
```

Expected result: an HTTP response from the MCP service (commonly `405` for GET when only MCP POST calls are accepted).

## 5. Run preflight checks

Use the included script before wiring SV-Krishna to MCP tools.

```bash
SIGNALK_URL=http://127.0.0.1:3000 \
INFLUXDB_URL=http://127.0.0.1:8086 \
INFLUXDB_ORG=svkrishna \
INFLUXDB_BUCKET=signalk \
INFLUXDB_TOKEN=<read-token> \
./deploy/scripts/marine-poc-preflight.sh
```

If SignalK API auth is enabled, add:

```bash
SIGNALK_TOKEN=<bearer-token>
```

Expected exit codes:

- `0`: all checks passed
- `2`: reachable but with warnings (usually auth/config gaps)
- `1`: hard failure

## 6. Transition from isolated PoC to boat network

1. Keep SV-Krishna and MCP sidecars on the Pi.
2. Point SignalK settings from local PoC URL to boat LAN SignalK server.
3. Keep InfluxDB local or boat-LAN hosted; update URLs accordingly.
4. Re-run preflight script with boat endpoints.
5. Only after stable telemetry checks, wire MCP calls into SV-Krishna chat flow.

## 7. Version pinning used for this runbook

Checked on 2026-04-26:

- `signalk-server` npm: `2.26.0`
- `signalk-mcp-server` npm: `1.0.8`
- `signalk-to-influxdb2` npm: `2.0.3`
- `influxdb-mcp-server` npm: `0.2.0`
