#!/usr/bin/env bash

set -euo pipefail

CHECK_PATH="${JELLYFIN_DISK_PATH:-/mnt/ssd/jellyfin/config}"
CONTAINER="${JELLYFIN_CONTAINER:-jellyfin}"
STOP_BELOW_GIB="${JELLYFIN_STOP_BELOW_GIB:-50}"
START_ABOVE_GIB="${JELLYFIN_START_ABOVE_GIB:-100}"
STATE_DIR="${JELLYFIN_GUARD_STATE_DIR:-/var/lib/jellyfin-disk-guard}"
STOPPED_MARKER="$STATE_DIR/stopped-by-disk-guard"

available_bytes="$(df --output=avail -B1 "$CHECK_PATH" | tail -n 1 | tr -d ' ')"
available_gib="$((available_bytes / 1024 / 1024 / 1024))"
running="$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null || printf 'missing')"

mkdir -p "$STATE_DIR"

if (( available_gib < STOP_BELOW_GIB )); then
  if [[ "$running" == "true" ]]; then
    logger -t jellyfin-disk-guard \
      "Stopping $CONTAINER: ${available_gib} GiB available is below ${STOP_BELOW_GIB} GiB"
    docker stop "$CONTAINER" >/dev/null
    date -Is >"$STOPPED_MARKER"
  fi
  exit 0
fi

if (( available_gib >= START_ABOVE_GIB )) && [[ -f "$STOPPED_MARKER" ]]; then
  if [[ "$running" == "false" ]]; then
    logger -t jellyfin-disk-guard \
      "Starting $CONTAINER: ${available_gib} GiB available is at least ${START_ABOVE_GIB} GiB"
    docker start "$CONTAINER" >/dev/null
  fi
  rm -f "$STOPPED_MARKER"
fi
