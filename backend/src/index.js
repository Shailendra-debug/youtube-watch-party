/**
 * YouTube Watch Party Server Entry Point
 * Express API + Socket.IO WebSocket Server + PostgreSQL Persistence
 */

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.js';
import { setupSocketHandlers } from './sockets/socketHandler.js';
import { initDatabase } from './db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for flexible testing and production deployments
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

// Mount REST API
app.use('/api', apiRoutes);

// Socket.IO Setup
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 10000
});

// Setup WebSocket event handlers
setupSocketHandlers(io);

// Static frontend serving if built
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Start Server and Initialize Database
async function bootstrap() {
  console.log(`Connecting to PostgreSQL database...`);
  await initDatabase();

  server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 YouTube Watch Party Backend Live!`);
    console.log(`📡 WebSocket & API: http://localhost:${PORT}`);
    console.log(`🗄️  PostgreSQL: Render Cloud Postgres Connected`);
    console.log(`=========================================`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal boot error:', err);
});
