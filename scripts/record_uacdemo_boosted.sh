#!/usr/bin/env bash

set -euo pipefail

output_path="${1:-/home/antony-slack/Documents/SV-Krishna/local/audio-tests/local-uacdemo-boosted.wav}"
duration="${2:-6}"
input_device="plughw:CARD=UACDemoV10,DEV=0"
temp_input="$(mktemp --suffix=.wav)"

cleanup() {
  rm -f "$temp_input"
}

trap cleanup EXIT

mkdir -p "$(dirname "$output_path")"

arecord -D "$input_device" -f S16_LE -r 16000 -c 1 -d "$duration" "$temp_input"

ffmpeg -hide_banner -loglevel error \
  -i "$temp_input" \
  -af "highpass=f=120,lowpass=f=7000,volume=24dB,alimiter=limit=0.92" \
  -c:a pcm_s16le \
  -y \
  "$output_path"
