const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Serve static frontend
app.use(express.static(path.join(__dirname)));

// In-memory rooms
// roomCode -> { name, hostId, mode, clients: Map<socketId, {id, name, role, volume}> }
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Create Room
  socket.on('create-room', ({ roomName, userName, mode }) => {
    if (mode === 'bluetooth') {
      socket.emit('error-msg', 'Bluetooth phone-to-phone sharing अभी supported नहीं है। Wi-Fi या Internet चुनें।');
      return;
    }
    const code = generateCode();
    const client = {
      id: socket.id,
      name: String(userName || 'Host').slice(0, 20),
      role: 'Host',
      volume: 80,
    };

    rooms.set(code, {
      name: String(roomName || 'SYNCWAVE Room').slice(0, 24),
      hostId: socket.id,
      mode: mode || 'wifi',
      clients: new Map([[socket.id, client]]),
      // Playback state
      isPlaying: false,
      currentTrack: null,
      currentTime: 0,
      startedAt: null,
      playlist: [],
    });

    socket.join(code);
    socket.roomCode = code;
    socket.isHost = true;

    socket.emit('room-created', {
      code,
      roomName: rooms.get(code).name,
      devices: [client],
    });

    console.log(`Room created: ${code} by ${userName}`);
  });

  // Join Room
  socket.on('join-room', ({ code, userName }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error-msg', 'Room नहीं मिला। Code चेक करें।');
      return;
    }

    if (room.clients.size >= 20) {
      socket.emit('error-msg', 'Room full है (maximum 20 devices).');
      return;
    }

    const client = {
      id: socket.id,
      name: String(userName || 'Guest').slice(0, 20),
      role: 'Guest',
      volume: 80,
    };

    room.clients.set(socket.id, client);
    socket.join(code);
    socket.roomCode = code;
    socket.isHost = false;

    // Send current state to joiner
    socket.emit('room-joined', {
      code,
      roomName: room.name,
      devices: Array.from(room.clients.values()),
      isPlaying: room.isPlaying,
      currentTrack: room.currentTrack,
      currentTime: room.isPlaying && room.startedAt
        ? room.currentTime + (Date.now() - room.startedAt) / 1000
        : room.currentTime,
    });

    // Notify others
    socket.to(code).emit('device-joined', {
      device: client,
      devices: Array.from(room.clients.values()),
    });

    console.log(`${userName} joined ${code}`);
  });

  // Leave / Disconnect
  function leaveRoom() {
    const code = socket.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    room.clients.delete(socket.id);

    if (room.clients.size === 0 || socket.id === room.hostId) {
      // Host left or empty → destroy room
      io.to(code).emit('room-closed', { reason: 'Host left the room' });
      rooms.delete(code);
      console.log(`Room destroyed: ${code}`);
    } else {
      socket.to(code).emit('device-left', {
        id: socket.id,
        devices: Array.from(room.clients.values()),
      });
    }

    socket.leave(code);
    socket.roomCode = null;
  }

  socket.on('leave-room', leaveRoom);
  socket.on('disconnect', () => {
    leaveRoom();
    console.log('Disconnected:', socket.id);
  });

  // ===== Playback Sync (Host controls) =====
  socket.on('play', ({ track, time }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId || !track || typeof track.url !== 'string') return;
    let parsed;
    try { parsed = new URL(track.url); } catch (_) { return; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return;

    room.isPlaying = true;
    room.currentTrack = {
      title: String(track.title || 'Untitled').slice(0, 120),
      artist: String(track.artist || '').slice(0, 120),
      url: parsed.href,
    };
    room.currentTime = Math.max(0, Number(time) || 0);
    room.startedAt = Date.now();

    socket.to(code).emit('sync-play', {
      track: room.currentTrack,
      time: room.currentTime,
      serverTime: Date.now(),
    });
  });

  socket.on('pause', ({ time }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId) return;

    room.isPlaying = false;
    room.currentTime = Math.max(0, Number(time) || 0);
    room.startedAt = null;

    socket.to(code).emit('sync-pause', {
      time: room.currentTime,
    });
  });

  socket.on('seek', ({ time }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId) return;

    if (!Number.isFinite(Number(time)) || Number(time) < 0) return;
    room.currentTime = Number(time);
    if (room.isPlaying) room.startedAt = Date.now();
    socket.to(code).emit('sync-seek', { time: room.currentTime });
  });

  socket.on('track-change', ({ track, index }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId || !track || typeof track.url !== 'string') return;
    let parsed;
    try { parsed = new URL(track.url); } catch (_) { return; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return;

    room.currentTrack = {
      title: String(track.title || 'Untitled').slice(0, 120),
      artist: String(track.artist || '').slice(0, 120),
      url: parsed.href,
    };
    room.currentTime = 0;
    room.startedAt = null;
    room.isPlaying = false;
    socket.to(code).emit('sync-track', { track: room.currentTrack, index });
  });

  // Volume update (per device)
  socket.on('volume-update', ({ volume }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room) return;

    const client = room.clients.get(socket.id);
    if (client) {
      client.volume = Math.max(0, Math.min(100, Number(volume) || 0));
      socket.to(code).emit('device-volume', {
        id: socket.id,
        volume,
        devices: Array.from(room.clients.values()),
      });
    }
  });

  // Kick device (host only)
  socket.on('kick-device', ({ targetId }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId) return;

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('kicked');
      targetSocket.leave(code);
      targetSocket.roomCode = null;
      targetSocket.isHost = false;
      room.clients.delete(targetId);
      io.to(code).emit('device-left', {
        id: targetId,
        devices: Array.from(room.clients.values()),
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  SYNCWAVE running at http://localhost:${PORT}\n`);
});
