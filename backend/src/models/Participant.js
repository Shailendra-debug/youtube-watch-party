/**
 * Participant Model
 * Represents an individual participant in a Watch Party room.
 * Encapsulates role definitions, permission checks, and serialization.
 */

export const ROLES = {
  HOST: 'host',
  MODERATOR: 'moderator',
  PARTICIPANT: 'participant',
  VIEWER: 'viewer' // Alias for participant
};

export class Participant {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique user identifier
   * @param {string} options.socketId - Active WebSocket ID
   * @param {string} options.username - Display name
   * @param {string} [options.role=ROLES.PARTICIPANT] - User role
   */
  constructor({ id, socketId, username, accountId = null, role = ROLES.PARTICIPANT }) {
    this.id = id;
    this.socketId = socketId;
    this.username = username || 'Anonymous User';
    this.accountId = accountId;
    this.role = role;
    this.joinedAt = new Date();
  }

  /**
   * Checks if user is the room Host
   * @returns {boolean}
   */
  isHost() {
    return this.role === ROLES.HOST;
  }

  /**
   * Checks if user is a Moderator
   * @returns {boolean}
   */
  isModerator() {
    return this.role === ROLES.MODERATOR;
  }

  /**
   * Determines if participant has permission to control video playback
   * (play, pause, seek, change video)
   * Only Host and Moderator can control playback.
   * @returns {boolean}
   */
  canControlPlayback() {
    return this.role === ROLES.HOST || this.role === ROLES.MODERATOR;
  }

  /**
   * Determines if participant can manage other participants (assign roles, kick, etc.)
   * Only Host has full management rights.
   * @returns {boolean}
   */
  canManageRoom() {
    return this.role === ROLES.HOST;
  }

  /**
   * Updates the participant's assigned role
   * @param {string} newRole
   */
  setRole(newRole) {
    if (Object.values(ROLES).includes(newRole)) {
      this.role = newRole;
    } else {
      throw new Error(`Invalid role: ${newRole}`);
    }
  }

  /**
   * Updates the socket connection ID (e.g., on reconnect)
   * @param {string} newSocketId
   */
  updateSocket(newSocketId) {
    this.socketId = newSocketId;
  }

  /**
   * Serializes participant for client-side broadcast
   * @returns {Object}
   */
  toJSON() {
    return {
      userId: this.id,
      username: this.username,
      role: this.role,
      isRegistered: Boolean(this.accountId),
      joinedAt: this.joinedAt.toISOString(),
      canControl: this.canControlPlayback(),
      isHost: this.isHost()
    };
  }
}
