const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
    const code = generateCode();
    const client = {
      id: socket.id,
      name: userName || 'Host',
      role: 'Host',
      volume: 80,
    };

    rooms.set(code, {
      name: roomName || 'SYNCWAVE Room',
      hostId: socket.id,
      mode: mode || 'wifi',
      clients: new Map([[socket.id, client]]),
      // Playback state
      isPlaying: false,
      currentTrack: null,
      currentTime: 0,
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

    const client = {
      id: socket.id,
      name: userName || 'Guest',
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
      currentTime: room.currentTime,
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
    if (!room || socket.id !== room.hostId) return;

    room.isPlaying = true;
    room.currentTrack = track;
    room.currentTime = time || 0;

    socket.to(code).emit('sync-play', {
      track,
      time: room.currentTime,
      serverTime: Date.now(),
    });
  });

  socket.on('pause', ({ time }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId) return;

    room.isPlaying = false;
    room.currentTime = time || 0;

    socket.to(code).emit('sync-pause', {
      time: room.currentTime,
    });
  });

  socket.on('seek', ({ time }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId) return;

    room.currentTime = time;
    socket.to(code).emit('sync-seek', { time });
  });

  socket.on('track-change', ({ track, index }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId) return;

    room.currentTrack = track;
    room.currentTime = 0;
    socket.to(code).emit('sync-track', { track, index });
  });

  // Volume update (per device)
  socket.on('volume-update', ({ volume }) => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room) return;

    const client = room.clients.get(socket.id);
    if (client) {
      client.volume = volume;
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
