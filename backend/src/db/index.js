/**
 * PostgreSQL Database Connection & Schema Management
 * Connects to PostgreSQL (Render Postgres) with SSL and initializes tables.
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://you_tube_user:8CyczO1g4NwkzRCkF0GQ0UApEHwGSxCF@dpg-db16bprncjis73bd3bbg-a.oregon-postgres.render.com/you_tube';

// Create connection pool with SSL configured for Render / cloud Postgres
export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

/**
 * Initializes PostgreSQL schema: rooms, participants, chat_messages, control_requests
 */
export async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log('[PostgreSQL] Connected to Render PostgreSQL database successfully!');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        display_name VARCHAR(80) NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        host_id VARCHAR(50),
        owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        video_id VARCHAR(50) NOT NULL DEFAULT 'jfKfPfyJRdk',
        play_state VARCHAR(20) NOT NULL DEFAULT 'paused',
        playback_time DOUBLE PRECISION DEFAULT 0,
        last_updated_at BIGINT,
        ended_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

      CREATE TABLE IF NOT EXISTS participants (
        id VARCHAR(50) PRIMARY KEY,
        room_id VARCHAR(50) REFERENCES rooms(id) ON DELETE CASCADE,
        username VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'participant',
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(100) PRIMARY KEY,
        room_id VARCHAR(50) REFERENCES rooms(id) ON DELETE CASCADE,
        sender_id VARCHAR(50),
        sender_name VARCHAR(100),
        sender_role VARCHAR(20),
        text TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS control_requests (
        id VARCHAR(100) PRIMARY KEY,
        room_id VARCHAR(50) REFERENCES rooms(id) ON DELETE CASCADE,
        user_id VARCHAR(50),
        username VARCHAR(100),
        action VARCHAR(50),
        video_id VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    client.release();
    console.log('[PostgreSQL] Tables verified and ready (rooms, participants, chat_messages, control_requests).');
    return true;
  } catch (err) {
    console.error('[PostgreSQL] Failed to initialize database:', err.message);
    console.warn('[PostgreSQL] Running with in-memory persistence fallback.');
    return false;
  }
}

/**
 * Database helper queries
 */
export const db = {
  // Save or update room
  async upsertRoom({ id, name, hostId, ownerAccountId, videoId, playState, currentTime, lastUpdatedAt }) {
    try {
      const query = `
        INSERT INTO rooms (id, name, host_id, owner_user_id, video_id, play_state, playback_time, last_updated_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          host_id = EXCLUDED.host_id,
          owner_user_id = COALESCE(EXCLUDED.owner_user_id, rooms.owner_user_id),
          video_id = EXCLUDED.video_id,
          play_state = EXCLUDED.play_state,
          playback_time = EXCLUDED.playback_time,
          last_updated_at = EXCLUDED.last_updated_at,
          updated_at = NOW();
      `;
      await pool.query(query, [id, name, hostId, ownerAccountId, videoId, playState, currentTime, lastUpdatedAt]);
    } catch (err) {
      console.error('[PostgreSQL] upsertRoom error:', err.message);
    }
  },

  // Save participant
  async upsertParticipant({ id, roomId, username, role }) {
    try {
      const query = `
        INSERT INTO participants (id, room_id, username, role, joined_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (id) DO UPDATE SET
          role = EXCLUDED.role,
          username = EXCLUDED.username;
      `;
      await pool.query(query, [id, roomId, username, role]);
    } catch (err) {
      console.error('[PostgreSQL] upsertParticipant error:', err.message);
    }
  },

  // Remove participant
  async removeParticipant(id) {
    try {
      await pool.query('DELETE FROM participants WHERE id = $1', [id]);
    } catch (err) {
      console.error('[PostgreSQL] removeParticipant error:', err.message);
    }
  },

  // Save chat message
  async saveChatMessage({ id, roomId, senderId, senderName, senderRole, text }) {
    try {
      const query = `
        INSERT INTO chat_messages (id, room_id, sender_id, sender_name, sender_role, text, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW());
      `;
      await pool.query(query, [id, roomId, senderId, senderName, senderRole, text]);
    } catch (err) {
      console.error('[PostgreSQL] saveChatMessage error:', err.message);
    }
  },

  // Fetch recent messages
  async getRecentMessages(roomId, limit = 50) {
    try {
      const res = await pool.query(
        'SELECT id, sender_id AS "senderId", sender_name AS "senderName", sender_role AS "senderRole", text, created_at AS "timestamp" FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT $2',
        [roomId, limit]
      );
      return res.rows;
    } catch (err) {
      console.error('[PostgreSQL] getRecentMessages error:', err.message);
      return [];
    }
  },

  // Fetch room from DB
  async getRoom(roomId) {
    try {
      const res = await pool.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
      return res.rows[0] || null;
    } catch (err) {
      console.error('[PostgreSQL] getRoom error:', err.message);
      return null;
    }
  },

  async endRoom(roomId, currentTime) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE rooms
         SET ended_at = NOW(), host_id = NULL, play_state = 'paused', playback_time = $2,
             last_updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, updated_at = NOW()
         WHERE id = $1 AND ended_at IS NULL`,
        [roomId, currentTime]
      );
      await client.query('DELETE FROM participants WHERE room_id = $1', [roomId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async createUser({ id, email, displayName, passwordHash }) {
    const result = await pool.query(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name AS "displayName", password_hash AS "passwordHash"`,
      [id, email, displayName, passwordHash]
    );
    return result.rows[0];
  },

  async getUserByEmail(email) {
    const result = await pool.query(
      `SELECT id, email, display_name AS "displayName", password_hash AS "passwordHash"
       FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    return result.rows[0] || null;
  },

  async getUserById(id) {
    const result = await pool.query(
      `SELECT id, email, display_name AS "displayName"
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }
};
