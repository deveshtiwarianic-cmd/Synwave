# SYNCWAVE

Multi-device synchronized music player — **एक साथ, एक धुन**।

## Features

| Feature | Status |
|---------|--------|
| Create / Join Room (6-digit code) | ✅ |
| Host Control (play/pause/seek/next/prev) | ✅ |
| Real-time Device List | ✅ |
| Per-device Volume | ✅ |
| Kick device (Host) | ✅ |
| Demo Tracks (public MP3) | ✅ |
| Add by URL (shareable) | ✅ |
| Local files (Host only) | ✅ |
| Connection status indicator | ✅ |
| Premium Black + Purple UI | ✅ |
| Offline / Local mode fallback | ✅ |

## Quick Start

### 1. Frontend only (UI test)
```bash
cd syncwave
npx serve .
# open http://localhost:3000
```

### 2. Full Multi-Device (recommended)
```bash
cd syncwave
npm install
npm start
```
Then open `http://localhost:3000` on **two devices / browsers**.

**How to test sync:**
1. Device A → Create Room → note the code
2. Device B → Join Room → enter code
3. Device A (Host) → press **🎵 Demo** button
4. Both devices should start playing the same track in sync

## Music Sources

- **Demo** — Built-in free tracks (best for testing multi-device)
- **URL** — Paste any direct `.mp3` / `.ogg` / `.wav` link
- **Local** — Files from phone (only plays on Host)

> Local files use blob URLs so they cannot be sent to other devices. Use Demo or URL for real sync.

## Project Structure

```
├── index.html      # UI screens
├── style.css       # Premium theme
├── app.js          # Frontend + Socket client
├── server.js       # Socket.IO rooms + sync
├── package.json
└── README.md
```

## Tech

- HTML / CSS / Vanilla JS
- Node.js + Express
- Socket.IO (real-time)
- Web Audio API

## Limitations (current MVP)

1. Perfect sample-accurate sync is hard over network — expect ~50-200ms drift
2. Bluetooth speaker mode needs native app (Web Bluetooth limitations)
3. YouTube links won't work directly (need direct audio file URLs)

## Next Roadmap

- [ ] WebRTC peer audio streaming
- [ ] Better clock sync (NTP-style)
- [ ] Capacitor Android APK
- [ ] Playlist visible to all members
- [ ] Host remote volume control per device

---
SYNCWAVE
