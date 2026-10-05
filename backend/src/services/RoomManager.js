/**
 * RoomManager Service (OOP Pattern)
 * Singleton service responsible for managing all active Watch Party rooms,
 * tracking socket-to-room mappings, and room lifecycle with PostgreSQL persistence.
 */

import { Room } from '../models/Room.js';
import { db } from '../db/index.js';

class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} roomId -> Room instance */
    this.rooms = new Map();

    /** @type {Map<string, { roomId: string, userId: string }>} socketId -> user meta */
    this.socketMap = new Map();

    /** @type {Map<string, NodeJS.Timeout>} roomId -> destruction timer */
    this.cleanupTimers = new Map();
  }

  /**
   * Generates a clean, readable 6-character room code (e.g., "PARTY-7K9")
   * @returns {string}
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (this.rooms.has(code)) {
      return this.generateRoomCode();
    }
    return code;
  }

  /**
   * Creates a new watch party room
   * @param {Object} options
   * @param {string} [options.roomId] - Optional custom code
   * @param {string} [options.name] - Room display name
   * @param {string} [options.initialVideoId] - Starting YouTube Video ID
   * @returns {Room}
   */
  createRoom({ roomId, name, initialVideoId, ownerAccountId } = {}) {
    const id = (roomId || this.generateRoomCode()).toUpperCase().trim();
    if (this.rooms.has(id)) {
      throw new Error(`Room "${id}" already exists.`);
    }

    const room = new Room({ id, name, initialVideoId, ownerAccountId });
    this.rooms.set(id, room);
    console.log(`[RoomManager] Created room: ${id}`);
    return room;
  }

  /**
   * Retrieves an existing room from memory, or restores it from PostgreSQL
   * @param {string} roomId
   * @returns {Promise<Room|undefined>}
   */
  async getOrRestoreRoom(roomId, initialVideoId = 'jfKfPfyJRdk') {
    if (!roomId) return undefined;
    const cleanId = roomId.toUpperCase().trim();

    // In-memory cache hit
    if (this.rooms.has(cleanId)) {
      return this.rooms.get(cleanId);
    }

    // Try loading from PostgreSQL
    try {
      const dbRoom = await db.getRoom(cleanId);
      if (dbRoom && !dbRoom.ended_at) {
        console.log(`[RoomManager] Restoring room ${cleanId} from PostgreSQL...`);
        const room = new Room({
          id: dbRoom.id,
          name: dbRoom.name,
          initialVideoId: dbRoom.video_id,
          ownerAccountId: dbRoom.owner_user_id || null
        });
        room.playState = dbRoom.play_state || 'paused';
        room.currentTime = parseFloat(dbRoom.playback_time) || 0;
        room.lastUpdatedAt = Number(dbRoom.last_updated_at) || Date.now();

        // Restore chat messages
        const recentMessages = await db.getRecentMessages(cleanId, 50);
        room.messages = recentMessages || [];

        this.rooms.set(cleanId, room);
        return room;
      }
    } catch (err) {
      console.warn(`[RoomManager] DB restore failed for ${cleanId}:`, err.message);
    }

    return undefined;
  }

  /**
   * Retrieves an existing room by ID from memory
   * @param {string} roomId
   * @returns {Room|undefined}
   */
  getRoom(roomId) {
    if (!roomId) return undefined;
    return this.rooms.get(roomId.toUpperCase().trim());
  }

  /**
   * Registers a socket connection to a specific user and room
   * @param {string} socketId
   * @param {string} roomId
   * @param {string} userId
   */
  registerSocket(socketId, roomId, userId) {
    this.socketMap.set(socketId, { roomId: roomId.toUpperCase().trim(), userId });

    const timer = this.cleanupTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(roomId);
    }
  }

  /**
   * Removes a socket from tracking
   * @param {string} socketId
   * @returns {{ roomId: string, userId: string }|undefined}
   */
  unregisterSocket(socketId) {
    const data = this.socketMap.get(socketId);
    if (data) {
      this.socketMap.delete(socketId);
    }
    return data;
  }

  /**
   * Schedules cleanup of an empty room from memory (persisted in DB)
   * @param {string} roomId
   * @param {number} [delayMs=1000 * 60 * 30] 30 minutes default
   */
  scheduleRoomCleanup(roomId, delayMs = 1000 * 60 * 30) {
    if (this.cleanupTimers.has(roomId)) {
      clearTimeout(this.cleanupTimers.get(roomId));
    }

    const timer = setTimeout(() => {
      const room = this.rooms.get(roomId);
      if (room && room.participants.size === 0) {
        this.rooms.delete(roomId);
        this.cleanupTimers.delete(roomId);
        console.log(`[RoomManager] Evicted empty room from memory: ${roomId} (stored safely in DB)`);
      }
    }, delayMs);

    this.cleanupTimers.set(roomId, timer);
  }

  /**
   * Deletes a room immediately
   * @param {string} roomId
   */
  deleteRoom(roomId) {
    const id = roomId.toUpperCase().trim();
    if (this.cleanupTimers.has(id)) {
      clearTimeout(this.cleanupTimers.get(id));
      this.cleanupTimers.delete(id);
    }
    return this.rooms.delete(id);
  }

  /**
   * Returns metadata of all active rooms
   * @returns {Array<Object>}
   */
  getAllRooms() {
    return Array.from(this.rooms.values()).map(r => r.toJSON());
  }

  /**
   * Returns active stats count
   * @returns {Object}
   */
  getStats() {
    let totalParticipants = 0;
    for (const r of this.rooms.values()) {
      totalParticipants += r.participants.size;
    }
    return {
      activeRooms: this.rooms.size,
      activeParticipants: totalParticipants
    };
  }
}

// Export singleton instance
export const roomManager = new RoomManager();
