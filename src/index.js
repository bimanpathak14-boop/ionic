import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Manual .env loading (Zero dependency)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
        if (key && !process.env[key]) process.env[key] = value;
      }
    });
  }
} catch (e) {}

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Routes
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import taskRoutes from './routes/tasks.js';
import chatRoutes from './routes/chat.js';
import fileRoutes from './routes/files.js';
import templateRoutes from './routes/templates.js';

// WebSocket & Telegram
import { initializeWebSocket } from './websocket/index.js';
import { initializeTelegram } from './services/telegramService.js';
import { startKeepAlive } from './services/keepAlive.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Socket.io
const io = new SocketIO(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Make io accessible to routes
app.set('io', io);

// ============ Middleware ============
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan('short'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

// ============ Routes ============
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/templates', templateRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Pocket AI Office Backend',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============ Initialize WebSocket & Telegram ============
initializeWebSocket(io);

// Start Telegram Bot early to register webhooks
let botInstance;
try {
  console.log('🤖 Initializing Telegram Bot...');
  botInstance = initializeTelegram(io);
  if (botInstance && botInstance.webhookPath) {
    app.use(botInstance.webhookCallback(botInstance.webhookPath));
  }
} catch (err) {
  console.error('❌ Error initializing Telegram:', err);
}

// ============ Start Server ============
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Pocket AI Office Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  
  if (botInstance && botInstance.webhookPath) {
    console.log(`🔗 Webhook route registered at ${botInstance.webhookPath}`);
  }

  // Start Keep-Alive (Prevent Render Sleep)
  startKeepAlive();
  
  console.log(`   WS:     ws://localhost:${PORT}\n`);
});

export default app;
