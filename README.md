# SYNCWAVE 1.1

Multi-device synchronized music player. A host creates a room; other phones join using a six-character code. Playback commands are sent in real time through Socket.IO.

## What works

- Create and join rooms using a room code.
- Wi-Fi/LAN mode: phones must be on the same network and open the host's server address.
- Internet mode: deploy this Node.js app to a public HTTPS host; everyone joins the same deployed URL.
- Host controls play, pause, seek, next and previous.
- Guests receive track changes and playback commands.
- Each phone controls its own speaker volume.
- Host can add direct audio-file URLs, demo MP3s, or local files.
- Host can remove a guest from the room.
- Rooms support up to 20 connected devices in this MVP.

## Start locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host computer. For another phone on the same Wi-Fi, open `http://HOST-LAN-IP:3000` (find the computer's local IP in its network settings).

## Deploy for Internet use

Deploy this folder as a Node.js web service on a host that supports persistent WebSocket connections.

- Build/install command: `npm install`
- Start command: `npm start`
- The host must provide the `PORT` environment variable (Render does this automatically).
- Use the public HTTPS service URL on every phone.

Rooms are stored in server memory. Restarting/redeploying the server clears active rooms. A single running server instance is expected for this MVP.

## Music source notes

- **Direct URL:** use a publicly reachable direct `.mp3`, `.ogg`, or `.wav` file URL. The website hosting the file must permit browser playback (CORS may be required by some hosts).
- **Demo:** uses public SoundHelix example MP3 files; availability depends on that external host and network.
- **Local file:** plays only on the host phone/browser. A browser `blob:` URL cannot be shared with other devices.
- YouTube, Spotify, and streaming-service page links are not direct audio-file URLs and will not play in this player.

## Important device limitations

- Wi-Fi and Internet modes use the same real-time Socket.IO room system; the difference is how phones reach the server.
- Bluetooth phone-to-phone audio broadcasting is **not** available in a normal mobile browser. The Bluetooth tab is retained as a disabled/future mode and the app warns users not to select it.
- Phones play the audio separately from the same URL. This is synchronized playback control, not one phone transmitting its audio signal to all other phones. Network delay and device audio buffering can cause small differences.
- Mobile browsers may block autoplay. A guest may need to tap **Tap to Play** once after joining or when the host starts playback.
- Keep the page open while listening; mobile browsers may pause background audio or network activity.

## Project files

- `index.html` — interface
- `style.css` — responsive visual design
- `app.js` — audio player and Socket.IO client
- `server.js` — room and playback synchronization server
- `package.json` — Node dependencies and start script
