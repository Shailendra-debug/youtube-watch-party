/**
 * Room Model
 * Encapsulates the entire state of a Watch Party room:
 * - Playback synchronization state (videoId, playState, currentTime, timestamp)
 * - Participant collection and role-based permissions
 * - Message history and control requests
 * - Asynchronous persistence to PostgreSQL database
 */

import { ROLES, Participant } from './Participant.js';
import { db } from '../db/index.js';

export const PLAY_STATES = {
  PLAYING: 'playing',
  PAUSED: 'paused'
};

export class Room {
  /**
   * @param {Object} options
   * @param {string} options.id - Room code / ID
   * @param {string} [options.name] - Room name
   * @param {string} [options.initialVideoId='jfKfPfyJRdk'] - Default YouTube Video ID (Lofi Girl)
   */
  constructor({ id, name, initialVideoId = 'jfKfPfyJRdk', ownerAccountId = null }) {
    this.id = id;
    this.name = name || `Party #${id}`;
    this.hostId = null;
    this.ownerAccountId = ownerAccountId;
    this.endedAt = null;
    this.videoId = initialVideoId;
    this.playState = PLAY_STATES.PAUSED;
    this.currentTime = 0; // In seconds
    this.lastUpdatedAt = Date.now(); // Epoch ms

    /** @type {Map<string, Participant>} */
    this.participants = new Map();

    /** @type {Array<Object>} */
    this.messages = [];

    /** @type {Array<Object>} */
    this.controlRequests = [];

    this.createdAt = new Date();

    // Persist new room to PostgreSQL
    this.saveStateToDB();
  }

  /**
   * Persists current room playback state to PostgreSQL
   */
  saveStateToDB() {
    db.upsertRoom({
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      ownerAccountId: this.ownerAccountId,
      videoId: this.videoId,
      playState: this.playState,
      currentTime: this.currentTime,
      lastUpdatedAt: this.lastUpdatedAt
    }).catch((err) => console.error('[DB] Room save error:', err.message));
  }

  end() {
    if (this.endedAt) return false;
    const finalTime = this.getCalculatedTime();
    this.endedAt = new Date();
    this.playState = PLAY_STATES.PAUSED;
    this.currentTime = finalTime;
    this.lastUpdatedAt = this.endedAt.getTime();
    this.hostId = null;
    return true;
  }

  /**
   * Adds a user to the room.
   * Only a registered room owner can become the Host.
   * Otherwise, they default to Participant.
   * @param {Participant} participant
   * @param {boolean} [isCreator=false]
   * @returns {Participant}
   */
  addParticipant(participant, isCreator = false) {
    if (isCreator && participant.accountId) {
      const previousHost = this.hostId ? this.participants.get(this.hostId) : null;
      if (previousHost && previousHost.id !== participant.id) {
        previousHost.setRole(ROLES.MODERATOR);
        db.upsertParticipant({
          id: previousHost.id,
          roomId: this.id,
          username: previousHost.username,
          role: previousHost.role
        });
      }
      participant.setRole(ROLES.HOST);
      this.hostId = participant.id;
    } else {
      participant.setRole(ROLES.PARTICIPANT);
    }

    this.participants.set(participant.id, participant);

    // Persist to PostgreSQL
    db.upsertParticipant({
      id: participant.id,
      roomId: this.id,
      username: participant.username,
      role: participant.role
    });
    this.saveStateToDB();

    return participant;
  }

  /**
   * Removes a participant by ID.
   * Handles host migration if the active host leaves.
   * @param {string} userId
   * @returns {Participant|null}
   */
  removeParticipant(userId, { preserveOwner = false } = {}) {
    const participant = this.participants.get(userId);
    if (!participant) return null;

    this.participants.delete(userId);

    // Delete participant from DB
    db.removeParticipant(userId);

    // If the host left, elect another registered participant as host.
    if (this.hostId === userId && this.participants.size > 0) {
      this.hostId = null;
      let nextHost = null;
      for (const p of this.participants.values()) {
        if (p.accountId && p.role === ROLES.MODERATOR) {
          nextHost = p;
          break;
        }
      }
      if (!nextHost) {
        nextHost = Array.from(this.participants.values()).find(
          p => p.accountId && p.role !== ROLES.VIEWER
        ) || null;
      }

      if (nextHost) {
        nextHost.setRole(ROLES.HOST);
        this.hostId = nextHost.id;
        if (!preserveOwner) this.ownerAccountId = nextHost.accountId;
        db.upsertParticipant({
          id: nextHost.id,
          roomId: this.id,
          username: nextHost.username,
          role: nextHost.role
        });
      }
    } else if (this.participants.size === 0) {
      this.hostId = null;
    }

    this.saveStateToDB();
    return participant;
  }

  /**
   * Retrieves participant by user ID
   * @param {string} userId
   * @returns {Participant|undefined}
   */
  getParticipant(userId) {
    return this.participants.get(userId);
  }

  /**
   * Retrieves participant by active socket ID
   * @param {string} socketId
   * @returns {Participant|undefined}
   */
  getParticipantBySocketId(socketId) {
    for (const participant of this.participants.values()) {
      if (participant.socketId === socketId) {
        return participant;
      }
    }
    return undefined;
  }

  /**
   * Assigns a role to a participant.
   * Only the Host can perform this action.
   * @param {string} requesterId - ID of user attempting the change
   * @param {string} targetUserId - ID of user receiving the new role
   * @param {string} newRole - Target role
   */
  assignRole(requesterId, targetUserId, newRole) {
    const requester = this.participants.get(requesterId);
    if (!requester || !requester.isHost()) {
      throw new Error('Unauthorized: Only the Room Host can assign roles');
    }

    const target = this.participants.get(targetUserId);
    if (!target) {
      throw new Error('User not found in room');
    }
    if (target.id === requesterId) {
      throw new Error('The Host cannot change their own role.');
    }

    if (newRole === ROLES.HOST) {
      return this.transferHost(requesterId, targetUserId);
    }

    target.setRole(newRole);

    // Persist updated role in DB
    db.upsertParticipant({
      id: target.id,
      roomId: this.id,
      username: target.username,
      role: target.role
    });

    return target;
  }

  /**
   * Transfers Host role to another participant.
   * The former host is reassigned to Moderator.
   * @param {string} currentHostId
   * @param {string} newHostId
   */
  transferHost(currentHostId, newHostId) {
    const currentHost = this.participants.get(currentHostId);
    if (!currentHost || !currentHost.isHost()) {
      throw new Error('Unauthorized: Only the current Host can transfer host status');
    }

    const newHost = this.participants.get(newHostId);
    if (!newHost) {
      throw new Error('Target user not found in room');
    }
    if (!newHost.accountId) {
      throw new Error('The new Host must have a registered account.');
    }

    currentHost.setRole(ROLES.MODERATOR);
    newHost.setRole(ROLES.HOST);
    this.hostId = newHost.id;
    this.ownerAccountId = newHost.accountId;

    // Persist both in DB
    db.upsertParticipant({
      id: currentHost.id,
      roomId: this.id,
      username: currentHost.username,
      role: currentHost.role
    });
    db.upsertParticipant({
      id: newHost.id,
      roomId: this.id,
      username: newHost.username,
      role: newHost.role
    });
    this.saveStateToDB();

    return { formerHost: currentHost, newHost };
  }

  /**
   * Removes a user from the room (Kick).
   * Only Host can kick members.
   * @param {string} requesterId
   * @param {string} targetUserId
   */
  kickParticipant(requesterId, targetUserId) {
    const requester = this.participants.get(requesterId);
    if (!requester || !requester.isHost()) {
      throw new Error('Unauthorized: Only the Host can remove participants');
    }

    if (requesterId === targetUserId) {
      throw new Error('Host cannot kick themselves. Use leave instead.');
    }

    return this.removeParticipant(targetUserId);
  }

  /**
   * Calculates the actual current playback time taking elapsed time into account
   * if the video is currently playing.
   * @returns {number}
   */
  getCalculatedTime() {
    if (this.playState === PLAY_STATES.PLAYING) {
      const elapsedSeconds = (Date.now() - this.lastUpdatedAt) / 1000;
      return Math.max(0, this.currentTime + elapsedSeconds);
    }
    return this.currentTime;
  }

  /**
   * Synchronizes playback state (Play/Pause/Seek)
   * Only Host or Moderator can change playback state.
   * @param {string} requesterId
   * @param {Object} stateUpdate
   * @param {string} [stateUpdate.playState]
   * @param {number} [stateUpdate.currentTime]
   */
  updatePlayback(requesterId, { playState, currentTime }) {
    const requester = this.participants.get(requesterId);
    if (!requester || !requester.canControlPlayback()) {
      throw new Error('Unauthorized: Only Host and Moderators can control playback');
    }

    if (currentTime !== undefined && typeof currentTime === 'number' && !isNaN(currentTime)) {
      this.currentTime = Math.max(0, currentTime);
    } else if (playState !== undefined) {
      this.currentTime = this.getCalculatedTime();
    }

    if (playState && Object.values(PLAY_STATES).includes(playState)) {
      this.playState = playState;
    }

    this.lastUpdatedAt = Date.now();
    this.saveStateToDB();

    return this.getSyncState();
  }

  /**
   * Changes the current YouTube video
   * Only Host or Moderator can change the video.
   * @param {string} requesterId
   * @param {string} videoId
   */
  changeVideo(requesterId, videoId) {
    const requester = this.participants.get(requesterId);
    if (!requester || !requester.canControlPlayback()) {
      throw new Error('Unauthorized: Only Host and Moderators can change the video');
    }

    if (!videoId || typeof videoId !== 'string') {
      throw new Error('Invalid YouTube Video ID');
    }

    this.videoId = videoId.trim();
    this.currentTime = 0;
    this.playState = PLAY_STATES.PLAYING;
    this.lastUpdatedAt = Date.now();
    this.saveStateToDB();

    return this.getSyncState();
  }

  /**
   * Records and persists a new chat message
   * @param {Object} messageData
   */
  addChatMessage({ senderId, senderName, senderRole, text }) {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      senderId,
      senderName,
      senderRole,
      text: text.slice(0, 500),
      timestamp: new Date().toISOString()
    };

    this.messages.push(message);
    if (this.messages.length > 100) {
      this.messages.shift();
    }

    // Persist to PostgreSQL
    db.saveChatMessage({
      id: message.id,
      roomId: this.id,
      senderId: message.senderId,
      senderName: message.senderName,
      senderRole: message.senderRole,
      text: message.text
    });

    return message;
  }

  /**
   * Handles a participant requesting control
   * @param {string} userId
   * @param {string} requestedAction
   * @param {string} [requestedVideoId]
   */
  addControlRequest(userId, requestedAction, requestedVideoId = null) {
    const user = this.participants.get(userId);
    if (!user) return null;

    const request = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId,
      username: user.username,
      requestedAction,
      requestedVideoId,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    this.controlRequests.push(request);
    return request;
  }

  /**
   * Returns current sync payload to broadcast to clients
   * @returns {Object}
   */
  getSyncState() {
    return {
      videoId: this.videoId,
      playState: this.playState,
      currentTime: this.getCalculatedTime(),
      lastUpdatedAt: this.lastUpdatedAt,
      hostId: this.hostId
    };
  }

  /**
   * Returns serialized participant array
   * @returns {Array<Object>}
   */
  getParticipantsList() {
    return Array.from(this.participants.values()).map(p => p.toJSON());
  }

  /**
   * Full room serialization
   * @returns {Object}
   */
  toJSON() {
    return {
      roomId: this.id,
      name: this.name,
      hostId: this.hostId,
      ...this.getSyncState(),
      participants: this.getParticipantsList(),
      recentMessages: this.messages.slice(-30),
      createdAt: this.createdAt.toISOString()
    };
  }
}
