# Deploy From Local Machine To Raspberry Pi

This document describes the repeatable process we use to get changes from the local development machine to the Raspberry Pi.

It covers two deployment paths:

1. Git pull + build on the Pi (recommended)
2. Copy `dist/` to the Pi (quick hotfix fallback)

It also calls out the RAG store workflow (build machine -> Pi).

## Assumptions

- Local repo path: `/home/antony-slack/Documents/SV-Krishna`
- Raspberry Pi app path: `/opt/svkrishna/app`
- Raspberry Pi RAG path: `/opt/svkrishna/rag`
- Pi user: `admin`
- Pi IP: `192.168.68.203`

If any of those differ, adjust the commands accordingly.

## 1) Git pull + build on the Pi (recommended)

### Step A - On the local machine: test, commit, push

From the repo root:

```bash
cd /home/antony-slack/Documents/SV-Krishna

# Run tests (required gate)
npm test

git status
git add -A
git commit -m "Describe change"
git push origin main
```

Note:

- The repo uses `main` as the primary branch.
- If `git push` fails due to HTTPS auth, ensure `origin` is set to SSH:
  - `git remote set-url origin git@github.com:SV-Krishna/SV-Krishna.git`

### Step B - On the Pi: pull, install, build

```bash
ssh admin@192.168.68.203

cd /opt/svkrishna/app

# If the working tree is clean, this should be a fast-forward pull.
git pull --ff-only

# Install Node deps exactly (uses package-lock.json)
npm ci

# Compile TypeScript -> dist/
npm run build
```

### Step C - Restart the app

If running via `systemd`, restart the service:

```bash
sudo systemctl restart svkrishna.service
```

If running manually in the background:

```bash
pkill -f "node dist/index.js" || true
nohup node dist/index.js >/opt/svkrishna/logs/app.out 2>&1 & disown
```

Validate:

```bash
tail -n 50 /opt/svkrishna/logs/app.out
```

## 2) Copy dist/ to the Pi (fallback)

Use this only for quick experiments. It bypasses the Pi build step and can lead to confusion if the Pi's TypeScript source does not match the `dist/` tree.

From local:

```bash
cd /home/antony-slack/Documents/SV-Krishna
npm run build

scp -r dist admin@192.168.68.203:/opt/svkrishna/app/
```

Then restart as above.

## 3) RAG store deployment (build machine -> Pi)

Docling extraction is expensive on the Pi for large manuals. The recommended approach is:

- build `store.json` + `embeddings.json` on the local machine
- copy PDFs + stores to the Pi

See `docs/rag-evaluation-report.md` for details and copy-paste commands.

## Common pitfalls

- Git state on Pi:
  - If `git pull` fails because of local changes/untracked files, stash first:
    - `git stash push -u -m "pre-update"`
- SSH host key / Git SSH auth:
  - If using `git@github.com` on the Pi and it fails with host key verification, add `github.com` to `~/.ssh/known_hosts` by running:
    - `ssh -T git@github.com`
  - If you cannot or do not want SSH auth on the Pi, keep the Pi remote as HTTPS and rely on public read access.
- Audio defaults:
  - Device `default` may not work for USB mics/speakers; set explicit ALSA devices via `arecord -L` / `aplay -L`.
