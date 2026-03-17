# Connor Dashboard

Personal daily command center — built with Electron + vanilla JS.

## Features

- **Home** — live clock, weather (Hendersonville NC), pomodoro timer, task + schedule overview
- **Tasks** — local task list with Notion sync
- **Schedule** — weekly calendar with color-coded blocks, cross-out, delete
- **Client request** — direct Notion task creation with full field mapping
- **Recap** — AI-powered meeting recap → .docx generator
- **Settings** — Notion integration token

## Data persistence

All data (tasks, schedule blocks, pomodoro state, Notion token) is saved to:

```
Mac:     ~/Library/Application Support/connor-dashboard/connor-dashboard-data.json
Windows: %APPDATA%\connor-dashboard\connor-dashboard-data.json
```

Written atomically on every change and on app close.

## Dev

```bash
npm install
npm start
```

## Build

```bash
# macOS DMG
npm run build:mac

# Windows installer
npm run build:win
```

Output lands in `dist/`.

## Stack

- Electron 28
- Vanilla JS / HTML / CSS — no frontend framework
- Local Node HTTP bridge (server.js) for Notion API + file persistence
- Open-Meteo API for live weather (no key needed)
- Anthropic API for recap generation
- Mammoth.js for .docx transcript parsing
