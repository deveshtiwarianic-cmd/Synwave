/* ===== SYNCWAVE Frontend — Real-time Multi-Device v2 ===== */

const state = {
  screen: 'home-screen',
  mode: 'wifi',
  isHost: false,
  roomCode: null,
  roomName: '',
  userName: '',
  devices: [],
  isPlaying: false,
  currentTrack: null,
  playlist: [],
  currentIndex: 0,
  volume: 80,
  audio: null,
  socket: null,
  connected: false,
};

// Public demo tracks (free to use)
const DEMO_TRACKS = [
  {
    title: 'SoundHelix Song 1',
    artist: 'T. Schürger',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    title: 'SoundHelix Song 2',
    artist: 'T. Schürger',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    title: 'SoundHelix Song 3',
    artist: 'T. Schürger',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Connection Status =====
function setConnStatus(status, text) {
  const el = $('#conn-status');
  if (!el) return;
  el.className = 'conn-status ' + status;
  $('#conn-text').textContent = text;
}

// ===== Socket.IO =====
function initSocket() {
  const tryConnect = () => {
    if (typeof io === 'undefined') return false;
    state.socket = io({ transports: ['websocket', 'polling'], reconnection: true });

    state.socket.on('connect', () => {
      state.connected = true;
      setConnStatus('online', 'Connected');
      console.log('Socket connected:', state.socket.id);
    });

    state.socket.on('disconnect', () => {
      state.connected = false;
      setConnStatus('offline', 'Disconnected');
    });

    state.socket.on('connect_error', () => {
      state.connected = false;
      setConnStatus('offline', 'Server offline (local mode)');
    });

    // Room events
    state.socket.on('room-created', ({ code, roomName, devices }) => {
      state.roomCode = code;
      state.roomName = roomName;
      state.devices = devices.map(d => ({ ...d, isMe: d.id === state.socket.id }));
      enterRoom();
      toast(`Room created · Code: ${code}`);
    });

    state.socket.on('room-joined', ({ code, roomName, devices, isPlaying, currentTrack, currentTime }) => {
      state.roomCode = code;
      state.roomName = roomName;
      state.devices = devices.map(d => ({ ...d, isMe: d.id === state.socket.id }));
      enterRoom();

      if (currentTrack && currentTrack.url) {
        loadRemoteTrack(currentTrack, currentTime || 0, isPlaying);
      }
      toast('Room join हो गया!');
    });

    state.socket.on('device-joined', ({ device, devices }) => {
      state.devices = devices.map(d => ({ ...d, isMe: d.id === state.socket.id }));
      updateDeviceList();
      updateDeviceCount();
      toast(`${device.name} जुड़ गया`);
    });

    state.socket.on('device-left', ({ devices }) => {
      state.devices = devices.map(d => ({ ...d, isMe: d.id === state.socket.id }));
      updateDeviceList();
      updateDeviceCount();
    });

    state.socket.on('room-closed', ({ reason }) => {
      toast(reason || 'Room बंद हो गया');
      forceLeave();
    });

    state.socket.on('kicked', () => {
      toast('Host ने आपको remove कर दिया');
      forceLeave();
    });

    state.socket.on('error-msg', (msg) => toast(msg));

    // Sync events
    state.socket.on('sync-play', ({ track, time, serverTime }) => {
      handleSyncPlay(track, time, serverTime);
    });

    state.socket.on('sync-pause', ({ time }) => {
      if (state.audio) {
        state.audio.pause();
        if (typeof time === 'number') state.audio.currentTime = time;
      }
      state.isPlaying = false;
      updatePlayUI(false);
    });

    state.socket.on('sync-seek', ({ time }) => {
      if (state.audio && typeof time === 'number') {
        state.audio.currentTime = time;
      }
    });

    state.socket.on('sync-track', ({ track, index }) => {
      if (track && track.url) {
        loadRemoteTrack(track, 0, false);
      }
    });

    state.socket.on('device-volume', ({ devices }) => {
      state.devices = devices.map(d => ({ ...d, isMe: d.id === state.socket.id }));
      updateDeviceList();
    });

    return true;
  };

  // Load Socket.IO
  if (typeof io !== 'undefined') {
    tryConnect();
    return;
  }

  const script = document.createElement('script');
  script.src = '/socket.io/socket.io.js';
  script.onload = () => tryConnect();
  script.onerror = () => {
    const cdn = document.createElement('script');
    cdn.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    cdn.onload = () => tryConnect();
    cdn.onerror = () => setConnStatus('offline', 'Offline mode');
    document.head.appendChild(cdn);
  };
  document.head.appendChild(script);
}

// ===== Screens =====
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (screen) {
    screen.classList.add('active');
    state.screen = id;
  }
}

function toast(msg, duration = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ===== Mode Tabs =====
function initModeTabs() {
  $$('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.mode-tabs');
      parent.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.mode = tab.dataset.mode;
      if (state.mode === 'bluetooth') {
        toast('Bluetooth phone-to-phone audio sharing browser में supported नहीं है। Wi-Fi या Internet चुनें।', 4200);
      }
    });
  });
}

// ===== Navigation =====
function initNav() {
  $('#btn-create').addEventListener('click', () => showScreen('create-screen'));
  $('#btn-join').addEventListener('click', () => showScreen('join-screen'));

  $$('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.back));
  });

  $('#btn-leave').addEventListener('click', leaveRoom);
}

// ===== Create Room =====
function initCreate() {
  $('#btn-create-confirm').addEventListener('click', () => {
    const roomName = $('#room-name').value.trim() || 'SYNCWAVE Room';
    const hostName = $('#host-name').value.trim() || 'Host';

    if (state.mode === 'bluetooth') {
      toast('Bluetooth mode अभी उपलब्ध नहीं है। Wi-Fi या Internet चुनें।', 3500);
      return;
    }
    state.isHost = true;
    state.userName = hostName;
    state.mode = document.querySelector('#create-screen .mode-tab.active')?.dataset.mode || 'wifi';

    if (state.socket?.connected) {
      state.socket.emit('create-room', {
        roomName,
        userName: hostName,
        mode: state.mode,
      });
    } else {
      state.isHost = false;
      toast('Server connect नहीं है। Internet चालू करके page reload करें।', 3500);
    }
  });
}

// ===== Join Room =====
function initJoin() {
  $('#btn-join-confirm').addEventListener('click', () => {
    const code = $('#join-code').value.trim().toUpperCase();
    const name = $('#guest-name').value.trim() || 'Guest';

    if (!code || code.length < 4) {
      toast('Valid Room Code डालें');
      return;
    }

    state.isHost = false;
    state.userName = name;

    if (state.socket?.connected) {
      state.socket.emit('join-room', { code, userName: name });
    } else {
      toast('Server से कनेक्ट नहीं हो पाया। पहले npm start चलाएँ।');
    }
  });
}

function generateLocalCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function enterRoom() {
  $('#room-title').textContent = state.roomName;
  $('#display-code').textContent = state.roomCode;
  updateDeviceList();
  updateDeviceCount();

  $('#host-actions').style.display = state.isHost ? 'block' : 'none';

  if (!state.isHost) {
    $('#btn-prev').style.opacity = '0.35';
    $('#btn-next').style.opacity = '0.35';
  } else {
    $('#btn-prev').style.opacity = '1';
    $('#btn-next').style.opacity = '1';
  }

  showScreen('room-screen');
}

function leaveRoom() {
  if (state.socket?.connected && state.roomCode) {
    state.socket.emit('leave-room');
  }
  forceLeave();
}

function forceLeave() {
  if (state.audio) {
    state.audio.pause();
    state.audio.src = '';
  }
  state.isPlaying = false;
  state.currentTrack = null;
  state.playlist = [];
  state.devices = [];
  state.roomCode = null;
  state.isHost = false;
  updatePlayUI(false);
  showScreen('home-screen');
}

// ===== Device List =====
function updateDeviceList() {
  const list = $('#device-list');
  list.innerHTML = '';

  state.devices.forEach(d => {
    const li = document.createElement('li');
    li.className = 'device-item';
    const avatar = document.createElement('div');
    avatar.className = 'device-avatar';
    avatar.textContent = (d.name || '?').charAt(0).toUpperCase();
    const info = document.createElement('div');
    info.className = 'device-info';
    const name = document.createElement('div');
    name.className = 'device-name';
    name.textContent = `${d.name || 'Guest'}${d.isMe ? ' (You)' : ''}`;
    const role = document.createElement('div');
    role.className = 'device-role';
    role.textContent = d.role || 'Guest';
    info.append(name, role);
    const volume = document.createElement('div');
    volume.className = 'device-vol';
    volume.textContent = `${d.volume ?? 80}%`;
    li.append(avatar, info, volume);
    if (state.isHost && !d.isMe && d.role !== 'Host') {
      const kick = document.createElement('button');
      kick.className = 'kick-btn';
      kick.dataset.id = d.id;
      kick.title = 'Remove';
      kick.textContent = '✕';
      li.appendChild(kick);
    }
    list.appendChild(li);
  });

  list.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.id;
      if (state.socket?.connected) {
        state.socket.emit('kick-device', { targetId });
      }
    });
  });
}

function updateDeviceCount() {
  const count = state.devices.length;
  $('#device-count').textContent = `${count} device${count > 1 ? 's' : ''}`;
  $('#devices-badge').textContent = count;
}

// ===== Audio Engine =====
function initAudio() {
  state.audio = new Audio();
  state.audio.crossOrigin = 'anonymous';
  state.audio.volume = state.volume / 100;

  state.audio.addEventListener('timeupdate', () => {
    if (!state.audio.duration) return;
    const pct = (state.audio.currentTime / state.audio.duration) * 100;
    $('#progress-fill').style.width = pct + '%';
    $('#current-time').textContent = formatTime(state.audio.currentTime);
  });

  state.audio.addEventListener('loadedmetadata', () => {
    $('#total-time').textContent = formatTime(state.audio.duration);
  });

  state.audio.addEventListener('ended', () => {
    if (state.isHost) playNext();
  });

  state.audio.addEventListener('error', () => {
    toast('Audio load failed — URL check करें');
    state.isPlaying = false;
    updatePlayUI(false);
  });

  $('#volume-slider').addEventListener('input', (e) => {
    state.volume = +e.target.value;
    $('#volume-value').textContent = state.volume;
    if (state.audio) state.audio.volume = state.volume / 100;

    const me = state.devices.find(d => d.isMe);
    if (me) {
      me.volume = state.volume;
      updateDeviceList();
    }

    if (state.socket?.connected) {
      state.socket.emit('volume-update', { volume: state.volume });
    }
  });

  $('#progress-bar').addEventListener('click', (e) => {
    if (!state.isHost || !state.audio?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * state.audio.duration;
    state.audio.currentTime = time;
    broadcastSeek(time);
  });
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ===== Player Controls =====
function initPlayer() {
  $('#btn-play').addEventListener('click', () => {
    if (!state.isHost) {
      toast('सिर्फ Host control कर सकता है');
      return;
    }
    togglePlay();
  });

  $('#btn-prev').addEventListener('click', () => {
    if (!state.isHost) return;
    playPrev();
  });

  $('#btn-next').addEventListener('click', () => {
    if (!state.isHost) return;
    playNext();
  });

  // Local files
  $('#btn-add-music').addEventListener('click', () => {
    $('#music-file').click();
  });

  $('#music-file').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      const url = URL.createObjectURL(file);
      state.playlist.push({
        title: file.name.replace(/\.[^/.]+$/, ''),
        artist: 'Local File',
        url,
        isLocal: true,
      });
    });

    if (!state.currentTrack) {
      loadTrack(0);
    }
    toast(`${files.length} local track added (Host only)`);
    e.target.value = '';
  });

  // URL modal
  $('#btn-add-url').addEventListener('click', () => {
    $('#url-modal').classList.remove('hidden');
    $('#track-url').value = '';
    $('#track-title-input').value = '';
    $('#track-url').focus();
  });

  $('#btn-url-cancel').addEventListener('click', () => {
    $('#url-modal').classList.add('hidden');
  });

  $('#btn-url-add').addEventListener('click', () => {
    const url = $('#track-url').value.trim();
    const title = $('#track-title-input').value.trim() || 'URL Track';
    let parsed;
    try { parsed = new URL(url); } catch (_) {}
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      toast('Valid http/https direct audio URL डालें');
      return;
    }
    $('#url-modal').classList.add('hidden');
    addUrlTrack(url, title);
  });

  // Guest tap-to-play (autoplay unlock)
  const syncBtn = $('#btn-sync-play');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      attemptPlay();
    });
  }

  // Demo track
  $('#btn-demo-track').addEventListener('click', () => {
    const track = DEMO_TRACKS[Math.floor(Math.random() * DEMO_TRACKS.length)];
    state.playlist.push({ ...track, isLocal: false });
    loadTrack(state.playlist.length - 1);
    setTimeout(() => {
      if (state.isHost) {
        state.audio.play().then(() => {
          state.isPlaying = true;
          updatePlayUI(true);
          broadcastPlay();
        }).catch(() => toast('Play failed'));
      }
    }, 400);
    toast('Demo track added');
  });
}

function addUrlTrack(url, title) {
  const track = {
    title,
    artist: 'URL Source',
    url,
    isLocal: false,
  };
  state.playlist.push(track);
  loadTrack(state.playlist.length - 1);
  const startWhenReady = () => {
    state.audio.play().then(() => {
      state.isPlaying = true;
      updatePlayUI(true);
      broadcastPlay();
    }).catch(() => toast('Play button दबाकर music शुरू करें'));
  };
  if (state.audio.readyState >= 2) startWhenReady();
  else state.audio.addEventListener('canplay', startWhenReady, { once: true });
  toast('Track added');
}

function loadTrack(index) {
  if (!state.playlist.length) return;
  state.currentIndex = index;
  state.currentTrack = state.playlist[index];

  if (state.audio) {
    state.audio.src = state.currentTrack.url;
    state.audio.load();
  }

  $('#track-title').textContent = state.currentTrack.title;
  $('#track-artist').textContent = state.currentTrack.artist;

  if (state.isHost && state.socket?.connected && !state.currentTrack.isLocal) {
    state.socket.emit('track-change', {
      track: {
        title: state.currentTrack.title,
        artist: state.currentTrack.artist,
        url: state.currentTrack.url,
      },
      index,
    });
  }
}

function loadRemoteTrack(track, time = 0, shouldPlay = false) {
  state.currentTrack = track;
  const exists = state.playlist.find(t => t.url === track.url);
  if (!exists) {
    state.playlist.push(track);
    state.currentIndex = state.playlist.length - 1;
  }

  if (state.audio) {
    state.audio.src = track.url;
    state.audio.load();
    state.audio.addEventListener('loadedmetadata', function onLoad() {
      state.audio.removeEventListener('loadedmetadata', onLoad);
      if (typeof time === 'number') state.audio.currentTime = time;
      if (shouldPlay) {
        attemptPlay();
      }
    }, { once: true });
  }

  $('#track-title').textContent = track.title || '—';
  $('#track-artist').textContent = track.artist || '—';
  state.isPlaying = false;
  updatePlayUI(false);
}

function attemptPlay() {
  if (!state.audio) return;
  state.audio.play().then(() => {
    state.isPlaying = true;
    updatePlayUI(true);
    hideSyncOverlay();
  }).catch((err) => {
    console.log('Autoplay blocked:', err);
    // Show tap-to-play overlay for guests
    if (!state.isHost) {
      showSyncOverlay();
    } else {
      toast('Play blocked — screen lock / silent mode check karo');
    }
  });
}

function showSyncOverlay() {
  const el = $('#sync-overlay');
  if (el) el.classList.remove('hidden');
}

function hideSyncOverlay() {
  const el = $('#sync-overlay');
  if (el) el.classList.add('hidden');
}

function togglePlay() {
  if (!state.currentTrack) {
    toast('पहले music add करें (Demo / URL / Local)');
    return;
  }

  if (state.isPlaying) {
    state.audio.pause();
    state.isPlaying = false;
    broadcastPause();
  } else {
    state.audio.play().then(() => {
      state.isPlaying = true;
      updatePlayUI(true);
      broadcastPlay();
    }).catch(() => toast('Play failed'));
    return;
  }
  updatePlayUI(state.isPlaying);
}

function playNext() {
  if (!state.playlist.length) return;
  const next = (state.currentIndex + 1) % state.playlist.length;
  loadTrack(next);
  state.audio.play().then(() => {
    state.isPlaying = true;
    updatePlayUI(true);
    broadcastPlay();
  }).catch(() => {});
}

function playPrev() {
  if (!state.playlist.length) return;
  const prev = (state.currentIndex - 1 + state.playlist.length) % state.playlist.length;
  loadTrack(prev);
  state.audio.play().then(() => {
    state.isPlaying = true;
    updatePlayUI(true);
    broadcastPlay();
  }).catch(() => {});
}

// ===== Broadcast helpers =====
function broadcastPlay() {
  if (!state.isHost || !state.socket?.connected) return;
  if (state.currentTrack?.isLocal) {
    toast('Local file — दूसरे devices पर नहीं चलेगा। URL/Demo use करें।');
    return;
  }
  state.socket.emit('play', {
    track: {
      title: state.currentTrack.title,
      artist: state.currentTrack.artist,
      url: state.currentTrack.url,
    },
    time: state.audio.currentTime,
  });
}

function broadcastPause() {
  if (!state.isHost || !state.socket?.connected) return;
  state.socket.emit('pause', { time: state.audio.currentTime });
}

function broadcastSeek(time) {
  if (!state.isHost || !state.socket?.connected) return;
  state.socket.emit('seek', { time });
}

function handleSyncPlay(track, time, serverTime) {
  if (!track) return;

  if (!state.currentTrack || state.currentTrack.url !== track.url) {
    loadRemoteTrack(track, time || 0, true);
  } else {
    if (state.audio) {
      if (typeof time === 'number' && Math.abs(state.audio.currentTime - time) > 0.8) {
        state.audio.currentTime = time;
      }
      attemptPlay();
    }
  }
}

function updatePlayUI(playing) {
  const playIcon = $('#btn-play .icon-play');
  const pauseIcon = $('#btn-play .icon-pause');
  const circle = $('#room-circle');
  const eq = $('#eq-bars');

  if (playing) {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    circle.classList.add('playing');
    eq.classList.add('playing');
  } else {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    circle.classList.remove('playing');
    eq.classList.remove('playing');
  }
}

// ===== Particles =====
function createParticles() {
  const container = $('#particles');
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.style.cssText = `
      position: absolute;
      width: ${2 + Math.random() * 3}px;
      height: ${2 + Math.random() * 3}px;
      background: rgba(168, 85, 247, ${0.15 + Math.random() * 0.25});
      border-radius: 50%;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation: float ${8 + Math.random() * 12}s linear infinite;
      animation-delay: -${Math.random() * 10}s;
    `;
    container.appendChild(p);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes float {
      0% { transform: translateY(0); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translateY(-100vh); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ===== Init =====
function init() {
  initModeTabs();
  initNav();
  initCreate();
  initJoin();
  initAudio();
  initPlayer();
  createParticles();
  initSocket();
  setConnStatus('offline', 'Connecting...');
}

document.addEventListener('DOMContentLoaded', init);
