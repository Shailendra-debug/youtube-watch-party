/**
 * REST API Routes
 * Endpoints for room creation, verification, and server health check
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { roomManager } from '../services/RoomManager.js';
import { db } from '../db/index.js';
import {
  createAccessToken,
  hashPassword,
  requireAuthentication,
  verifyPassword
} from '../services/auth.js';

const router = express.Router();

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName
});

router.post('/auth/register', async (req, res) => {
  const displayName = String(req.body?.displayName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (displayName.length < 2 || displayName.length > 60) {
    return res.status(400).json({ success: false, error: 'Name must be between 2 and 60 characters.' });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ success: false, error: 'Password must be between 8 and 128 characters.' });
  }

  try {
    const user = await db.createUser({
      id: randomUUID(),
      email,
      displayName,
      passwordHash: await hashPassword(password)
    });
    const safeUser = publicUser(user);
    return res.status(201).json({
      success: true,
      token: createAccessToken(safeUser),
      user: safeUser
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
    }
    console.error('[Auth] Registration failed:', err.message);
    return res.status(503).json({ success: false, error: 'Account service is temporarily unavailable.' });
  }
});

router.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  try {
    const user = await db.getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ success: false, error: 'Email or password is incorrect.' });
    }
    const safeUser = publicUser(user);
    return res.json({ success: true, token: createAccessToken(safeUser), user: safeUser });
  } catch (err) {
    console.error('[Auth] Login failed:', err.message);
    return res.status(503).json({ success: false, error: 'Account service is temporarily unavailable.' });
  }
});

router.get('/auth/me', requireAuthentication, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Please log in again.' });
    }
    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('[Auth] Session lookup failed:', err.message);
    // The access token was signature- and expiry-checked by requireAuthentication.
    // Keep an existing session usable during a temporary profile database outage.
    return res.json({ success: true, user: publicUser(req.user), sessionFromToken: true });
  }
});

/**
 * Health Check & Stats
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: 'PostgreSQL (Render)',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    ...roomManager.getStats()
  });
});

/**
 * Create a new Watch Room
 * POST /api/rooms
 * Body: { name?: string, initialVideoId?: string, customCode?: string }
 */
router.post('/rooms', requireAuthentication, async (req, res) => {
  try {
    const { name, initialVideoId, customCode } = req.body || {};
    const roomId = customCode ? String(customCode).trim().toUpperCase() : null;
    if (roomId && (roomManager.getRoom(roomId) || await db.getRoom(roomId))) {
      return res.status(409).json({ success: false, error: `Room "${roomId}" already exists.` });
    }
    const room = roomManager.createRoom({
      roomId,
      name,
      initialVideoId,
      ownerAccountId: req.user.id
    });

    res.status(201).json({
      success: true,
      roomId: room.id,
      name: room.name,
      videoId: room.videoId,
      createdAt: room.createdAt
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Check if a room exists (checks memory and PostgreSQL)
 * GET /api/rooms/:roomId
 */
router.get('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const cleanId = roomId.toUpperCase().trim();
  let room = roomManager.getRoom(cleanId);

  if (room) {
    if (room.endedAt) {
      return res.status(410).json({ success: false, error: 'This watch party has ended.' });
    }
    return res.json({
      success: true,
      room: {
        roomId: room.id,
        name: room.name,
        videoId: room.videoId,
        participantCount: room.participants.size,
        hasHost: !!room.hostId
      }
    });
  }

  // Check PostgreSQL
  const dbRoom = await db.getRoom(cleanId);
  if (dbRoom) {
    if (dbRoom.ended_at) {
      return res.status(410).json({ success: false, error: 'This watch party has ended.' });
    }
    return res.json({
      success: true,
      room: {
        roomId: dbRoom.id,
        name: dbRoom.name,
        videoId: dbRoom.video_id,
        participantCount: 0,
        hasHost: !!dbRoom.host_id
      }
    });
  }

  res.status(404).json({
    success: false,
    error: `Room "${cleanId}" not found.`
  });
});

/**
 * List active rooms
 * GET /api/rooms
 */
router.get('/rooms', (req, res) => {
  res.json({
    success: true,
    rooms: roomManager.getAllRooms()
  });
});

export default router;
