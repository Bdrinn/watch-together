import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../client/dist')));

// Store active rooms and their state
const rooms = new Map();
const ROOM_RETENTION_MS = 2 * 60 * 1000;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        playlist: [],
        currentVideoIndex: -1,
        isPlaying: false,
        currentTime: 0,
        lastUpdated: Date.now(),
        users: [],
        cleanupTimer: null
      });
    }

    const room = rooms.get(roomId);
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    const now = Date.now();

    if (room.isPlaying) {
      const elapsedSeconds = (now - room.lastUpdated) / 1000;
      room.currentTime = Math.max(0, room.currentTime + elapsedSeconds);
    }

    room.lastUpdated = now;
    room.users.push(socket.id);

    const currentVideo = room.currentVideoIndex >= 0 ? room.playlist[room.currentVideoIndex] : null;

    // Send current room state to joining user
    socket.emit('room-state', {
      currentVideo: currentVideo,
      playlist: room.playlist,
      currentVideoIndex: room.currentVideoIndex,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime
    });

    // Notify other users
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userCount: room.users.length
    });

    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // User adds video to playlist
  socket.on('set-video', (data) => {
    const { roomId, videoUrl } = data;
    const room = rooms.get(roomId);
    
    if (room) {
      // If no video is playing, start this one
      if (room.currentVideoIndex === -1) {
        room.playlist.push(videoUrl);
        room.currentVideoIndex = 0;
        room.currentTime = 0;
        room.isPlaying = true;
        room.lastUpdated = Date.now();
        
        io.to(roomId).emit('video-changed', {
          currentVideo: videoUrl,
          playlist: room.playlist,
          currentVideoIndex: 0,
          currentTime: 0
        });
      } else {
        // Add to watch later queue
        room.playlist.push(videoUrl);
        room.lastUpdated = Date.now();
        
        io.to(roomId).emit('playlist-updated', {
          playlist: room.playlist,
          currentVideoIndex: room.currentVideoIndex
        });
      }
    }
  });

  // User plays a video from watch later
  socket.on('play-from-queue', (data) => {
    const { roomId, index } = data;
    const room = rooms.get(roomId);
    
    if (room && index >= 0 && index < room.playlist.length) {
      room.currentVideoIndex = index;
      room.currentTime = 0;
      room.isPlaying = true;
      room.lastUpdated = Date.now();
      
      io.to(roomId).emit('video-changed', {
        currentVideo: room.playlist[index],
        playlist: room.playlist,
        currentVideoIndex: index,
        currentTime: 0
      });
    }
  });

  // User removes video from queue
  socket.on('remove-from-queue', (data) => {
    const { roomId, index } = data;
    const room = rooms.get(roomId);
    
    if (room && index >= 0 && index < room.playlist.length) {
      room.playlist.splice(index, 1);
      
      if (room.currentVideoIndex >= room.playlist.length) {
        room.currentVideoIndex = room.playlist.length - 1;
      }
      
      room.lastUpdated = Date.now();
      
      io.to(roomId).emit('playlist-updated', {
        playlist: room.playlist,
        currentVideoIndex: room.currentVideoIndex
      });
    }
  });

  // Sync play
  socket.on('play', (payload) => {
    const { roomId, currentTime } = typeof payload === 'string' ? { roomId: payload } : payload;
    const room = rooms.get(roomId);
    if (room) {
      if (typeof currentTime === 'number' && !Number.isNaN(currentTime)) {
        room.currentTime = currentTime;
      }
      room.isPlaying = true;
      room.lastUpdated = Date.now();
      io.to(roomId).emit('video-play', {
        timestamp: Date.now(),
        currentTime: room.currentTime
      });
    }
  });

  // Sync pause
  socket.on('pause', (payload) => {
    const { roomId, currentTime } = typeof payload === 'string' ? { roomId: payload } : payload;
    const room = rooms.get(roomId);
    if (room) {
      const now = Date.now();

      if (room.isPlaying) {
        const elapsedSeconds = (now - room.lastUpdated) / 1000;
        room.currentTime = Math.max(0, room.currentTime + elapsedSeconds);
      }

      if (typeof currentTime === 'number' && !Number.isNaN(currentTime)) {
        room.currentTime = currentTime;
      }

      room.isPlaying = false;
      room.lastUpdated = now;
      io.to(roomId).emit('video-pause', {
        currentTime: room.currentTime
      });
    }
  });

  // Sync seek
  socket.on('seek', (data) => {
    const { roomId, currentTime } = data;
    const room = rooms.get(roomId);
    if (room) {
      room.currentTime = currentTime;
      room.lastUpdated = Date.now();
      socket.to(roomId).emit('video-seek', {
        currentTime: currentTime
      });
    }
  });

  // Sync playback snapshot (used before reload)
  socket.on('sync-state', (data) => {
    const { roomId, currentTime, isPlaying } = data || {};
    const room = rooms.get(roomId);

    if (!room) return;

    if (typeof currentTime === 'number' && !Number.isNaN(currentTime)) {
      room.currentTime = currentTime;
    }

    if (typeof isPlaying === 'boolean') {
      room.isPlaying = isPlaying;
    }

    room.lastUpdated = Date.now();
  });

  // User skips to next video
  socket.on('skip-to-next', (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.currentVideoIndex < room.playlist.length - 1) {
      room.currentVideoIndex++;
      room.currentTime = 0;
      room.isPlaying = true;
      room.lastUpdated = Date.now();
      
      io.to(roomId).emit('video-changed', {
        currentVideo: room.playlist[room.currentVideoIndex],
        playlist: room.playlist,
        currentVideoIndex: room.currentVideoIndex,
        currentTime: 0
      });
    }
  });

  // User disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    for (const [roomId, room] of rooms.entries()) {
      const index = room.users.indexOf(socket.id);
      if (index > -1) {
        room.users.splice(index, 1);
        
        if (room.users.length === 0) {
          room.cleanupTimer = setTimeout(() => {
            rooms.delete(roomId);
          }, ROOM_RETENTION_MS);
        } else {
          io.to(roomId).emit('user-left', {
            userCount: room.users.length
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
  