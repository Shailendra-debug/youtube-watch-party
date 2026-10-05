/**
 * WebSocket Event Handler
 * Implements real-time synchronization, role enforcement, and room messaging
 * following the exact WebSocket Events specification.
 */

import { roomManager } from '../services/RoomManager.js';
import { Participant, ROLES } from '../models/Participant.js';
import { PLAY_STATES } from '../models/Room.js';
import { db } from '../db/index.js';
import { verifyAccessToken } from '../services/auth.js';

export function setupSocketHandlers(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    socket.data.account = token ? verifyAccessToken(token) : null;
    next();
  });

  // Keep players aligned while a video is running, even when nobody seeks or toggles playback.
  const syncHeartbeat = setInterval(() => {
    for (const room of roomManager.rooms.values()) {
      if (room.playState === PLAY_STATES.PLAYING && room.participants.size > 1) {
        io.to(room.id).emit('sync_state', room.getSyncState());
      }
    }
  }, 2000);
  syncHeartbeat.unref?.();

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Helper: find user and room for current socket
    const getSocketContext = () => {
      const socketData = roomManager.socketMap.get(socket.id);
      if (!socketData) return { room: null, participant: null, userMeta: null };
      const room = roomManager.getRoom(socketData.roomId);
      const participant = room ? room.getParticipant(socketData.userId) : null;
      return { room, participant, userMeta: socketData };
    };

    /**
     * 1. join_room
     * Direction: Client -> Server
     * Payload: { roomId, username, isCreator, initialVideoId }
     */
    socket.on('join_room', async (payload = {}) => {
      try {
        const { roomId, username, isCreator, initialVideoId, restoreHostAccountId } = payload;
        if (!roomId || !roomId.trim()) {
          socket.emit('error_message', { message: 'Room ID is required.' });
          return;
        }

        const cleanRoomId = roomId.trim().toUpperCase();
        const roomOwner = socket.data.account;
        if (restoreHostAccountId && (!roomOwner || restoreHostAccountId !== roomOwner.id)) {
          socket.emit('error_message', { message: 'Sign in with the host account to return to this room.' });
          return;
        }
        let room = roomManager.getRoom(cleanRoomId);
        if (room?.endedAt) {
          socket.emit('error_message', { message: 'This watch party has ended.' });
          return;
        }

        const requestedCreate = isCreator === true;
        if (requestedCreate) {
          if (!roomOwner) {
            socket.emit('error_message', { message: 'Log in or register before creating a watch party.' });
            return;
          }
          if (room) {
            if (room.ownerAccountId !== roomOwner.id || room.hostId) {
              socket.emit('error_message', { message: 'That room code is already in use. Please create another room.' });
              return;
            }
          } else {
            const savedRoom = await db.getRoom(cleanRoomId);
            if (savedRoom) {
              if (savedRoom.ended_at) {
                socket.emit('error_message', { message: 'This watch party has ended.' });
                return;
              }
              room = await roomManager.getOrRestoreRoom(cleanRoomId, initialVideoId || 'jfKfPfyJRdk');
              if (!room || room.ownerAccountId !== roomOwner.id || room.hostId) {
                socket.emit('error_message', { message: 'That room code is already in use. Please create another room.' });
                return;
              }
            } else {
              room = roomManager.createRoom({
                roomId: cleanRoomId,
                initialVideoId: initialVideoId || 'jfKfPfyJRdk',
                ownerAccountId: roomOwner.id
              });
            }
          }
        } else if (!room) {
          const savedRoom = await db.getRoom(cleanRoomId);
          if (!savedRoom) {
            socket.emit('error_message', { message: `Room "${cleanRoomId}" was not found.` });
            return;
          }
          if (savedRoom.ended_at) {
            socket.emit('error_message', { message: 'This watch party has ended.' });
            return;
          }
          room = await roomManager.getOrRestoreRoom(cleanRoomId, initialVideoId || 'jfKfPfyJRdk');
          if (!room) {
            socket.emit('error_message', { message: `Room "${cleanRoomId}" was not found.` });
            return;
          }
        }

        // Generate persistent or socket-based userId
        const userId = `usr_${socket.id}`;
        const canClaimHost = Boolean(roomOwner && (
          requestedCreate || room.ownerAccountId === roomOwner.id
        ));
        const participant = new Participant({
          id: userId,
          socketId: socket.id,
          username: (requestedCreate || canClaimHost
            ? roomOwner.displayName
            : String(username || 'Guest').trim().slice(0, 60)),
          accountId: roomOwner?.id || null
        });

        // A verified owner creates or reclaims the Host role; room guests never need an account.
        const previousHost = canClaimHost && room.hostId
          ? room.getParticipant(room.hostId)
          : null;
        room.addParticipant(participant, canClaimHost);
        roomManager.registerSocket(socket.id, room.id, userId);

        // Join socket.io channel
        socket.join(room.id);

        console.log(`[Socket] User ${participant.username} (${userId}) joined room ${room.id} as ${participant.role}`);

        // Send full initial state to the newly joined client
        socket.emit('joined_successfully', {
          roomId: room.id,
          userId: participant.id,
          username: participant.username,
          role: participant.role,
          isRoomOwner: Boolean(roomOwner && room.ownerAccountId === roomOwner.id),
          room: room.toJSON()
        });

        // Broadcast sync_state to ensure client player is primed
        socket.emit('sync_state', room.getSyncState());

        if (previousHost && previousHost.id !== participant.id) {
          io.to(room.id).emit('role_assigned', {
            userId: previousHost.id,
            username: previousHost.username,
            role: previousHost.role,
            isRoomOwner: previousHost.accountId === room.ownerAccountId,
            participants: room.getParticipantsList()
          });
        }

        // Broadcast to everyone else in the room that a new user joined
        io.to(room.id).emit('user_joined', {
          username: participant.username,
          userId: participant.id,
          role: participant.role,
          participants: room.getParticipantsList()
        });
      } catch (err) {
        console.error('[Socket] join_room error:', err.message);
        socket.emit('error_message', { message: err.message });
      }
    });

    /**
     * 2. leave_room
     * Direction: Client -> Server
     * Payload: { roomId }
     */
    socket.on('leave_room', () => {
      handleUserLeave(socket, io);
    });

    socket.on('end_room', async () => {
      const { room, participant } = getSocketContext();
      if (!room || !participant) return;
      if (!participant.isHost()) {
        socket.emit('permission_denied', {
          action: 'end_room',
          message: 'Only the Room Host can end this watch party.'
        });
        return;
      }

      try {
        await db.endRoom(room.id, room.getCalculatedTime());
        room.end();
        io.to(room.id).emit('room_ended', { roomId: room.id, message: 'The host ended this watch party.' });

        for (const member of room.participants.values()) {
          const memberSocket = io.sockets.sockets.get(member.socketId);
          if (memberSocket) memberSocket.leave(room.id);
          roomManager.unregisterSocket(member.socketId);
        }
        roomManager.deleteRoom(room.id);
      } catch (err) {
        console.error('[Socket] end_room error:', err.message);
        socket.emit('error_message', { message: 'The room could not be ended. Please try again.' });
      }
    });

    /**
     * 3. play
     * Direction: Client -> Server
     * Payload: { currentTime }
     * Requires: Host/Moderator
     */
    socket.on('play', (payload = {}) => {
      try {
        const { room, participant } = getSocketContext();
        if (!room || !participant) return;

        // Role Enforcement
        if (!participant.canControlPlayback()) {
          socket.emit('permission_denied', {
            action: 'play',
            message: 'Only Host and Moderators can play/pause the video.'
          });
          return;
        }

        const currentTime = typeof payload.currentTime === 'number' ? payload.currentTime : undefined;
        room.updatePlayback(participant.id, { playState: PLAY_STATES.PLAYING, currentTime });

        const syncState = room.getSyncState();
        console.log(`[Sync] Room ${room.id} PLAY at ${syncState.currentTime.toFixed(2)}s by ${participant.username}`);

        // Broadcast sync_state to all room participants
        io.to(room.id).emit('sync_state', syncState);
      } catch (err) {
        console.error('[Socket] play error:', err.message);
        socket.emit('error_message', { message: err.message });
      }
    });

    /**
     * 4. pause
     * Direction: Client -> Server
     * Payload: { currentTime }
     * Requires: Host/Moderator
     */
    socket.on('pause', (payload = {}) => {
      try {
        const { room, participant } = getSocketContext();
        if (!room || !participant) return;

        // Role Enforcement
        if (!participant.canControlPlayback()) {
          socket.emit('permission_denied', {
            action: 'pause',
            message: 'Only Host and Moderators can play/pause the video.'
          });
          return;
        }

        const currentTime = typeof payload.currentTime === 'number' ? payload.currentTime : undefined;
        room.updatePlayback(participant.id, { playState: PLAY_STATES.PAUSED, currentTime });

        const syncState = room.getSyncState();
        console.log(`[Sync] Room ${room.id} PAUSE at ${syncState.currentTime.toFixed(2)}s by ${participant.username}`);

        io.to(room.id).emit('sync_state', syncState);
      } catch (err) {
        console.error('[Socket] pause error:', err.message);
        socket.emit('error_message', { message: err.message });
      }
    });

    /**
     * 5. seek
     * Direction: Client -> Server
     * Payload: { time }
     * Requires: Host/Moderator
     */
    socket.on('seek', ({ time }) => {
      try {
        const { room, participant } = getSocketContext();
        if (!room || !participant) return;

        // Role Enforcement
        if (!participant.canControlPlayback()) {
          socket.emit('permission_denied', {
            action: 'seek',
            message: 'Only Host and Moderators can seek the video.'
          });
          return;
        }

        if (typeof time !== 'number' || isNaN(time)) {
          return;
        }

        room.updatePlayback(participant.id, { currentTime: time });
        const syncState = room.getSyncState();
        console.log(`[Sync] Room ${room.id} SEEK to ${time.toFixed(2)}s by ${participant.username}`);

        io.to(room.id).emit('sync_state', syncState);
      } catch (err) {
        console.error('[Socket] seek error:', err.message);
        socket.emit('error_message', { message: err.message });
      }
    });

    /**
     * 6. change_video
     * Direction: Client -> Server
     * Payload: { videoId }
     * Requires: Host/Moderator
     */
    socket.on('change_video', ({ videoId }) => {
      try {
        const { room, participant } = getSocketContext();
        if (!room || !participant) return;

        // Role Enforcement
        if (!participant.canControlPlayback()) {
          socket.emit('permission_denied', {
            action: 'change_video',
            message: 'Only Host and Moderators can change the video.'
          });
          return;
        }

        if (!videoId || typeof videoId !== 'string') {
          socket.emit('error_message', { message: 'Invalid video ID.' });
          return;
        }

        room.changeVideo(participant.id, videoId);
        const syncState = room.getSyncState();
        console.log(`[Sync] Room ${room.id} CHANGED VIDEO to ${videoId} by ${participant.username}`);

        io.to(room.id).emit('sync_state', syncState);
      } catch (err) {
        console.error('[Socket] change_video error:', err.message);
        socket.emit('error_message', { message: err.message });
      }
    });

    /**
     * 7. assign_role
     * Direction: Client -> Server
     * Payload: { userId, role }
     * Requires: Host only
     */
    socket.on('assign_role', ({ userId, role }) => {
      try {
        const { room, participant } = getSocketContext();
        if (!room || !participant) return;

        // Role Enforcement: Host only
        if (!participant.isHost()) {
          socket.emit('permission_denied', {
            action: 'assign_role',
            message: 'Only the Room Host can assign roles.'
          });
          return;
        }

        if (![ROLES.MODERATOR, ROLES.PARTICIPANT, ROLES.VIEWER].includes(role)) {
          socket.emit('error_message', { message: 'Choose Moderator, Participant, or Viewer for this role change.' });
          return;
        }

        const targetParticipant = room.assignRole(participant.id, userId, role);

        console.log(`[Roles] User ${targetParticipant.username} assigned role ${role} by ${participant.username}`);

        // Broadcast role_assigned to all clients
        io.to(room.id).emit('role_assigned', {
          userId: targetParticipant.id,
          username: targetParticipant.username,
          role: targetParticipant.role,
          isRoomOwner: targetParticipant.accountId === room.ownerAccountId,
          participants: room.getParticipantsList()
        });
        io.to(room.id).emit('sync_state', room.getSyncState());
      } catch (err) {
        console.error('[Socket] assign_role error:', err.message);
        socket.emit('error_message', { message: err.message });
      }
    });

    /**
     * 8. transfer_host
     * Direction: Client -> Server
     * Payload: { userId }
     * Requires: Host only
     */
    socket.on('transfer_host', ({ userId }) => {
      try {
        const { room, participant } = getSocketContext();
        if (!room || !participant) return;

        if (!participant.isHost()) {
          socket.emit('permission_denied', {
            action: 'transfer_host',
            message: 'Only the current Host can transfer ownership.'
          });
          return;
        }

        const { formerHost, newHost } = room.transferHost(participant.id, userId);

        console.log(`[Roles] Host transferred from ${formerHost.username} to ${newHost.username}`);

        // Notify both users so the former host immediately loses host controls.
        io.to(room.id).emit('role_assigned', {
          userId: formerHost.id,
          username: formerHost.username,
          role: formerHost.role,
          isRoomOwner: formerHost.accountId === room.ownerAccountId,
          participants: room.getParticipantsList()
        });
        io.to(room.id).emit('role_assigned', {
          userId: newHost.id,
          username: newHost.username,
          role: newHost.role,
          isRoomOwner: newHost.accountId === room.ownerAccountId,
          participants: room.getParticipantsList()
        });

        // Also broadcast sync state with new hostId
        io.to(room.id).emit('sync_state', room.getSyncState());
      } catch (err) {
        console.error('[Socket] transfer_host error:', err.message);
        socket.emit('error_message', { message: err.message });
      }
    });

    /**
     * 9. remove_participant (Kick)
     * Direction: Client -> Server
     * Payload: { userId }
     * Requires: Host only
     */
    socket.on('remove_participant', ({ userId }) => {
      try {
        const { room, participant } = getSocketContext();
        if (!room || !participant) return;

        if (!participant.isHost()) {
          socket.emit('permission_denied', {
            action: 'remove_participant',
            message: 'Only the Room Host can remove participants.'
          });
          return;
        }

        const targetUser = room.getParticipant(userId);
        if (!targetUser) return;

        // Disconnect or notify target participant
        const targetSocket = io.sockets.sockets.get(targetUser.socketId);
        if (targetSocket) {
          targetSocket.emit('kicked_from_room', {
            message: 'You have been removed from the room by the host.'
          });
          targetSocket.leave(room.id);
          roomManager.unregisterSocket(targetUser.socketId);
        }

        room.removeParticipant(userId);
        console.log(`[Participants] User ${targetUser.username} was removed by host ${participant.username}`);

        // Broadcast participant_removed to room
        io.to(room.id).emit('participant_removed', {
          userId,
          username: targetUser.username,
          participants: room.getParticipantsList()
        });
      } catch (err) {
        console.error('[Socket] remove_participant error:', err.message);
        socket.emit('error_message', { message: err.message });
      }
    });

    /**
     * 10. chat_message (Bonus Feature)
     * Direction: Client -> Server
     * Payload: { text }
     */
    socket.on('chat_message', ({ text }) => {
      try {
        const { room, participant } = getSocketContext();
        if (!room || !participant || !text || !text.trim()) return;
        if (!participant.canInteract()) {
          socket.emit('permission_denied', { action: 'chat_message', message: 'Viewer access is read-only.' });
          return;
        }

        const message = room.addChatMessage({
          senderId: participant.id,
          senderName: participant.username,
          senderRole: participant.role,
          text: text.trim()
        });

        io.to(room.id).emit('chat_message', message);
      } catch (err) {
        console.error('[Socket] chat_message error:', err.message);
      }
    });

    /**
     * 11. send_reaction (Bonus Feature: Floating Emojis)
     * Direction: Client -> Server
     * Payload: { emoji }
     */
    socket.on('send_reaction', ({ emoji }) => {
      const { room, participant } = getSocketContext();
      if (!room || !participant || !emoji) return;
      if (!participant.canInteract()) {
        socket.emit('permission_denied', { action: 'send_reaction', message: 'Viewer access is read-only.' });
        return;
      }

      io.to(room.id).emit('receive_reaction', {
        id: `react_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        emoji,
        senderName: participant.username
      });
    });

    /**
     * 12. request_action (Participant Permission Request Workflow)
     * "Participant must request admin/mod to approve any changes for them to come into action"
     * Direction: Client -> Server
     * Payload: { action: 'play' | 'pause' | 'change_video', videoId?: string }
     */
    socket.on('request_action', ({ action, videoId }) => {
      const { room, participant } = getSocketContext();
      if (!room || !participant) return;
      if (!participant.canInteract()) {
        socket.emit('permission_denied', { action: 'request_action', message: 'Viewer access is read-only.' });
        return;
      }

      const request = room.addControlRequest(participant.id, action, videoId);
      if (!request) return;

      console.log(`[Request] User ${participant.username} requested ${action} in room ${room.id}`);

      // Forward request to all hosts and moderators
      for (const p of room.participants.values()) {
        if (p.canControlPlayback()) {
          const modSocket = io.sockets.sockets.get(p.socketId);
          if (modSocket) {
            modSocket.emit('control_request_received', request);
          }
        }
      }
    });

    /**
     * 13. approve_request (Host/Mod approves participant request)
     */
    socket.on('approve_request', ({ requestId }) => {
      const { room, participant } = getSocketContext();
      if (!room || !participant || !participant.canControlPlayback()) return;

      const reqIndex = room.controlRequests.findIndex(r => r.id === requestId);
      if (reqIndex === -1) return;

      const request = room.controlRequests[reqIndex];
      room.controlRequests.splice(reqIndex, 1);

      // Execute requested action
      if (request.requestedAction === 'change_video' && request.requestedVideoId) {
        room.changeVideo(participant.id, request.requestedVideoId);
      } else if (request.requestedAction === 'play') {
        room.updatePlayback(participant.id, { playState: PLAY_STATES.PLAYING });
      } else if (request.requestedAction === 'pause') {
        room.updatePlayback(participant.id, { playState: PLAY_STATES.PAUSED });
      }

      io.to(room.id).emit('sync_state', room.getSyncState());
      io.to(room.id).emit('request_resolved', { requestId, status: 'approved', approvedBy: participant.username });
    });

    /**
     * Handle Disconnect
     */
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      handleUserLeave(socket, io, { preserveRoomOwner: true });
    });
  });
}

/**
 * Common handler for user disconnection or leave
 */
function handleUserLeave(socket, io, { preserveRoomOwner = false } = {}) {
  const socketData = roomManager.unregisterSocket(socket.id);
  if (!socketData) return;

  const { roomId, userId } = socketData;
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const leftUser = room.removeParticipant(userId, { preserveOwner: preserveRoomOwner });
  socket.leave(room.id);

  if (leftUser) {
    console.log(`[Socket] User ${leftUser.username} left room ${room.id}`);

    // Notify room of user leaving
    io.to(room.id).emit('user_left', {
      username: leftUser.username,
      userId: leftUser.id,
      participants: room.getParticipantsList()
    });

    // If host changed, broadcast role update
    if (room.participants.size > 0 && room.hostId) {
      const newHost = room.getParticipant(room.hostId);
      if (newHost) {
        io.to(room.id).emit('role_assigned', {
          userId: newHost.id,
          username: newHost.username,
          role: ROLES.HOST,
          isRoomOwner: newHost.accountId === room.ownerAccountId,
          participants: room.getParticipantsList()
        });
      }
      io.to(room.id).emit('sync_state', room.getSyncState());
    }
  }

  // Schedule room cleanup if empty
  if (room.participants.size === 0) {
    roomManager.scheduleRoomCleanup(room.id);
  }
}
