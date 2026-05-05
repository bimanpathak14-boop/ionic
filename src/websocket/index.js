import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { devices } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Initialize Socket.io WebSocket server
 */
export function initializeWebSocket(io) {
  // Auth middleware for WebSocket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

      const jwtSecret = process.env.JWT_SECRET || 'pocket_ai_secret_key_123_change_me';
      const decoded = jwt.verify(token, jwtSecret);
      socket.userId = decoded.userId;

      // If connecting as a desktop agent, attach device info
      const deviceId = socket.handshake.auth?.deviceId;
      if (deviceId) {
        socket.deviceId = deviceId;
        socket.isAgent = true;
        console.log(`[WS] Agent Authed: device=${deviceId}`);
      }

      next();
    } catch (error) {
      console.error('[WS] Auth Error:', error.message);
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId, deviceId, isAgent } = socket;
    console.log(`[WS] Connected: user=${userId} device=${deviceId || 'mobile'}`);

    // Join user room (for receiving events)
    socket.join(`user:${userId}`);

    // If desktop agent, join device room and update status
    if (isAgent && deviceId) {
      socket.join(`device:${deviceId}`);
      await db.update(devices)
        .set({ status: 'online', lastSeen: new Date() })
        .where(eq(devices.id, deviceId));

      io.to(`user:${userId}`).emit('device:connected', { deviceId, status: 'online' });
    }

    // ---- Desktop Agent Events ----

    // Agent reports task progress
    socket.on('task:progress', (data) => {
      io.to(`user:${userId}`).emit('task:progress', data);
    });

    // Agent reports task completion
    socket.on('task:completed', (data) => {
      io.to(`user:${userId}`).emit('task:completed', data);
    });

    // Agent reports task failure
    socket.on('task:failed', (data) => {
      io.to(`user:${userId}`).emit('task:failed', data);
    });

    // Agent reports file created
    socket.on('file:created', (data) => {
      io.to(`user:${userId}`).emit('file:created', data);
    });

    // Agent sends live edit updates
    socket.on('live:update', (data) => {
      io.to(`user:${userId}`).emit('live:update', data);
    });

    // ---- Mobile App Events ----

    // Mobile sends command directly to device
    socket.on('command:send', (data) => {
      if (data.deviceId) {
        io.to(`device:${data.deviceId}`).emit('command:execute', data);
      }
    });

    // Mobile requests live preview
    socket.on('live:request', (data) => {
      if (data.deviceId) {
        io.to(`device:${data.deviceId}`).emit('live:capture', data);
      }
    });

    // ---- Heartbeat ----
    socket.on('heartbeat', () => {
      socket.emit('heartbeat:ack', { timestamp: Date.now() });
      if (isAgent && deviceId) {
        db.update(devices)
          .set({ lastSeen: new Date() })
          .where(eq(devices.id, deviceId)).catch(() => {});
      }
    });

    // ---- Disconnect ----
    socket.on('disconnect', async () => {
      console.log(`[WS] Disconnected: user=${userId} device=${deviceId || 'mobile'}`);
      if (isAgent && deviceId) {
        await db.update(devices)
          .set({ status: 'offline', lastSeen: new Date() })
          .where(eq(devices.id, deviceId)).catch(() => {});

        io.to(`user:${userId}`).emit('device:disconnected', { deviceId });
      }
    });
  });

  return io;
}
