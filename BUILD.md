# Building Connor Dashboard

## Requirements
- Node.js 18+ — https://nodejs.org (LTS version)
- macOS for .dmg / Windows for .exe

## Build the DMG (Mac)

```bash
cd connor-dashboard
npm install
npm run build:mac
```

The `.dmg` installer appears in the `dist/` folder.  
Double-click it, drag **Connor Dashboard** to Applications, done.

## Build the Windows installer

```bash
npm install
npm run build:win
```

Output: `dist/Connor Dashboard Setup 1.0.0.exe`

## Dev mode (no build needed)

```bash
npm install
npm start
```

## Where data is saved

Your tasks, schedule blocks, and settings are saved to:

**Mac:** `~/Library/Application Support/connor-dashboard/connor-dashboard-data.json`  
**Windows:** `%APPDATA%\connor-dashboard\connor-dashboard-data.json`

This file is created automatically on first run. It's plain JSON — you can
back it up or inspect it any time. It survives app updates and reinstalls.

## Notion token

Set it once in ⚙ Settings inside the app. It's also saved to the data file
above so you never have to re-enter it after reinstalling.
