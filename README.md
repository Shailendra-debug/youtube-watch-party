<<<<<<< HEAD
# youtube-watch-party
=======
# 🎬 SyncPlay – Real-Time YouTube Watch Party System

> Full-Stack Real-Time YouTube Watch Party with **Node.js (Express)**, **WebSockets (Socket.IO)**, **React**, **Tailwind CSS**, and persistent **PostgreSQL (Render Cloud Database)**.

---

## 📋 Table of Contents
1. [Overview](#-overview)
2. [Project Architecture](#-project-architecture)
3. [Live Database Integration (PostgreSQL)](#-live-database-integration-postgresql)
4. [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
5. [WebSocket Events Specification](#-websocket-events-specification)
6. [OOP Design Pattern](#-oop-design-pattern)
7. [Getting Started Locally](#-getting-started-locally)
   - [Run Backend Separately](#1-run-backend-standalone)
   - [Run Frontend Separately](#2-run-frontend-standalone)
   - [Run Full-Stack Monorepo](#3-run-full-stack-root-scripts)
8. [Code Walkthrough & Interview Prep](#-code-walkthrough--interview-readiness)
9. [Deployment Guide (Render / Railway / Vercel)](#-deployment-guide)

---

## 🌟 Overview

SyncPlay allows multiple users to watch YouTube videos together in real time with sub-second synchronization.
When a **Host** or **Moderator** plays, pauses, seeks, or changes the video, all participants in the watch party room follow seamlessly without drift or feedback loops.

### Key Highlights
- **Sub-Second Synchronization**: Real-time play, pause, seek, and video changes via WebSocket bidirectional channels.
- **Loop-Prevention Engine**: Sophisticated remote-action suppression preventing playback feedback cascades.
- **Strict Server-Side RBAC**: The backend validates roles (`host`, `moderator`, `participant`) before processing any playback or management action.
- **PostgreSQL Persistence**: Powered by a live Render PostgreSQL database with automatic table migrations for rooms, participants, chat history, and permission requests.
- **Participant Permission Requests**: Participants can ask the Host to play/pause or suggest a YouTube video with a 1-click Host approval banner.
- **Live Chat & Animated Floating Reactions**: Real-time room chat with role badges and floating emoji bursts (🔥, ❤️, 😂, 👏, 🍿, 🚀).

---

## 🏗️ Project Architecture

```
youtube-watch-party/
├── backend/                       # Standalone Node.js (Express + Socket.IO + PostgreSQL)
│   ├── src/
│   │   ├── db/
│   │   │   └── index.js           # PostgreSQL connection pool & table migrations
│   │   ├── models/
│   │   │   ├── Participant.js     # OOP Participant class with permission checks
│   │   │   └── Room.js            # OOP Room class with playback sync & DB persistence
│   │   ├── services/
│   │   │   └── RoomManager.js     # Singleton managing active rooms & DB restores
│   │   ├── sockets/
│   │   │   └── socketHandler.js   # WebSocket event handlers & RBAC enforcement
│   │   ├── routes/
│   │   │   └── api.js             # REST API endpoints (/api/health, /api/rooms)
│   │   └── index.js               # Express + HTTP Server + Socket.IO entrypoint
│   ├── .env                       # Environment variables (Database URL, Port)
│   └── package.json
│
├── frontend/                      # Standalone React + Vite + Tailwind CSS Application
│   ├── src/
│   │   ├── components/
│   │   │   ├── YouTubePlayer.jsx  # Controllable YouTube IFrame player with loop suppression
│   │   │   ├── ParticipantsPanel.jsx # User list with role badges & host moderation actions
│   │   │   ├── ChatAndReactions.jsx  # Live chat & floating emoji bursts
│   │   │   ├── ChangeVideoBar.jsx # YouTube URL parser, quick presets, & suggestion flow
│   │   │   ├── ApprovalRequestsBanner.jsx # Host request approval banner
│   │   │   ├── Lobby.jsx          # Room creation & joining portal
│   │   │   └── Modals.jsx         # Request modal & kicked notification
│   │   ├── utils/
│   │   │   └── youtube.js         # URL parser, timestamp formatters, video presets
│   │   ├── App.jsx                # Main application state & WebSocket coordination
│   │   └── index.css              # Tailwind CSS styling & animations
│   ├── .env                       # Frontend socket server configuration
│   ├── vite.config.js             # Vite build & development proxy
│   └── package.json
│
└── package.json                   # Root orchestrator scripts
```

---

## 🗄️ Live Database Integration (PostgreSQL)

The application connects to a cloud-hosted PostgreSQL database on **Render**:

```env
DATABASE_URL=postgresql://you_tube_user:8CyczO1g4NwkzRCkF0GQ0UApEHwGSxCF@dpg-db16bprncjis73bd3bbg-a.oregon-postgres.render.com/you_tube
```

### Relational Schema

```sql
-- 1. Watch Party Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255),
  host_id VARCHAR(50),
  video_id VARCHAR(50) NOT NULL DEFAULT 'jfKfPfyJRdk',
  play_state VARCHAR(20) NOT NULL DEFAULT 'paused',
  playback_time DOUBLE PRECISION DEFAULT 0,
  last_updated_at BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Participants & Roles
CREATE TABLE IF NOT EXISTS participants (
  id VARCHAR(50) PRIMARY KEY,
  room_id VARCHAR(50) REFERENCES rooms(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Room Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(100) PRIMARY KEY,
  room_id VARCHAR(50) REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id VARCHAR(50),
  sender_name VARCHAR(100),
  sender_role VARCHAR(20),
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Participant Action Requests
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
```

---

## 🔐 Role-Based Access Control (RBAC)

Rooms feature strict role-based permissions enforced by the backend:

| Role | Who Assigns | Permissions |
| :--- | :--- | :--- |
| 👑 **Host** | Auto-assigned to room creator | **Full Control**: Play, pause, seek, change video, assign roles (promote/demote), kick participants, transfer host ownership. |
| 🛡️ **Moderator** | Assigned by Host | **Playback Control**: Play, pause, seek, change video. Cannot kick participants or assign roles. |
| 👤 **Participant / Viewer** | Default for joiners | **Watch Only**: Cannot control playback directly. Can submit action/video requests for Host/Mod approval. |

---

## ⚡ WebSocket Events Specification

| Event | Direction | Payload | Description | Role Required |
| :--- | :--- | :--- | :--- | :--- |
| `join_room` | Client ➔ Server | `{ roomId, username, isCreator, initialVideoId }` | User joins room; server assigns role & emits sync state | Anyone |
| `leave_room` | Client ➔ Server | `{ roomId }` | User leaves room; auto-elects new host if host departs | Anyone |
| `sync_state` | Server ➔ Clients | `{ videoId, playState, currentTime, lastUpdatedAt, hostId }` | Authoritative playback broadcast | Server Broadcast |
| `play` | Client ➔ Server | `{ currentTime }` | Play video | **Host / Moderator** |
| `pause` | Client ➔ Server | `{ currentTime }` | Pause video | **Host / Moderator** |
| `seek` | Client ➔ Server | `{ time }` | Seek video scrubber to timestamp | **Host / Moderator** |
| `change_video`| Client ➔ Server | `{ videoId }` | Load and play a new YouTube video | **Host / Moderator** |
| `assign_role` | Client ➔ Server | `{ userId, role }` | Promote or demote participant | **Host Only** |
| `transfer_host`| Client ➔ Server | `{ userId }` | Transfer host status to another participant | **Host Only** |
| `remove_participant`| Client ➔ Server | `{ userId }` | Kick user from party | **Host Only** |
| `user_joined` | Server ➔ Clients | `{ username, userId, role, participants }` | New participant notification | Broadcast |
| `user_left` | Server ➔ Clients | `{ username, userId, participants }` | Participant departure notification | Broadcast |
| `role_assigned`| Server ➔ Clients| `{ userId, username, role, participants }` | Role change notification | Broadcast |
| `participant_removed`| Server ➔ Clients| `{ userId, username, participants }` | Kicked user notification | Broadcast |
| `chat_message`| Both | `{ text }` / `{ id, senderId, senderName, senderRole, text, timestamp }` | Real-time text chat | Anyone |
| `send_reaction`| Client ➔ Server | `{ emoji }` | Broadcast animated floating reaction | Anyone |
| `request_action`| Client ➔ Server | `{ action, videoId }` | Participant requests playback action or video change | Participant |
| `approve_request`| Client ➔ Server | `{ requestId }` | Host/Moderator executes participant request | **Host / Moderator** |

---

## 🧩 OOP Design Pattern

The backend is built around robust Object-Oriented Programming (OOP) principles:

1. **`Participant` Class (`models/Participant.js`)**:
   - Encapsulates participant identity, socket mapping, role assignment, and permission query methods (`isHost()`, `isModerator()`, `canControlPlayback()`, `canManageRoom()`).
2. **`Room` Class (`models/Room.js`)**:
   - Encapsulates state synchronization (`videoId`, `playState`, `currentTime`, `lastUpdatedAt`), participant collections, chat history, and automated PostgreSQL persistence.
   - Includes elapsed-time drift compensation: calculates exact current second for new joiners (`currentTime + (now - lastUpdatedAt)`).
3. **`RoomManager` Class (`services/RoomManager.js`)**:
   - Singleton pattern coordinating all active rooms, socket tracking, PostgreSQL state restoration, and garbage collection of inactive rooms.

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v18+ or v20+)
- npm (v9+ or v10+)

---

### 1. Run Backend Standalone
```bash
cd backend

# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Or start in production mode
npm start
```
The backend will run on **`http://localhost:5000`** and automatically initialize tables in the PostgreSQL database.

---

### 2. Run Frontend Standalone
```bash
cd frontend

# Install dependencies
npm install

# Start Vite React development server
npm run dev
```
The frontend will run on **`http://localhost:5173`**.

---

### 3. Run Full-Stack (Root Scripts)
From the root `youtube-watch-party/` directory:

```bash
# Install dependencies for both backend & frontend
npm run install:all

# Run backend development server
npm run dev:backend

# In a second terminal, run frontend development server
npm run dev:frontend

# Build frontend production bundle
npm run build:frontend
```

---

## 💡 Code Walkthrough & Interview Readiness

Be prepared to discuss these core technical decisions:

### 1. How WebSockets Enable Real-Time Sync
- Unlike HTTP polling which adds unnecessary latency and server load, **Socket.IO over WebSockets** provides persistent, full-duplex TCP communication.
- When an authorized user executes a playback action (play/pause/seek), the server receives the event, commits the state to memory and PostgreSQL, and broadcasts `sync_state` to all sockets in the room room channel (`io.to(roomId).emit('sync_state', state)`).

### 2. Feedback Cascade Loop Prevention
- **The Problem**: When a participant receives a `sync_state` event from the server and calls `player.playVideo()`, the YouTube IFrame API fires its native `onStateChange` event. If the client naively emits `play` back to the server, an infinite loop or permission rejection storm occurs.
- **The Solution**: 
  1. A mutable `isRemoteAction` ref is set to `true` whenever an incoming WebSocket event modifies player state.
  2. The `onStateChange` listener inspects `isRemoteAction.current` and user permissions before emitting any event to the server.
  3. A 1.8-second seek threshold prevents tiny jitter adjustments caused by minor network latency.

### 3. Server-Side Role Enforcement
- Permissions are strictly validated on the backend before any state mutation occurs. Even if a user attempts to dispatch a `change_video` or `play` event using developer tools or raw socket frames, the backend checks `participant.canControlPlayback()`, rejects the command, and emits a `permission_denied` toast.

### 4. Database Resilience
- Database operations are non-blocking and asynchronously dispatched so network latency to the cloud database does not delay sub-second WebSocket broadcasts.
- If database connectivity drops momentarily, the in-memory OOP models continue synchronizing real-time playback seamlessly.

---

## 🌐 Deployment Guide

### Deploying to Render
1. Push this repository to GitHub.
2. Create a new **Web Service** on Render.
3. Configure the service:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && cd ../frontend && npm install && npm run build`
   - **Start Command**: `node src/index.js`
   - **Environment Variables**:
     - `DATABASE_URL`: `postgresql://you_tube_user:8CyczO1g4NwkzRCkF0GQ0UApEHwGSxCF@dpg-db16bprncjis73bd3bbg-a.oregon-postgres.render.com/you_tube`
     - `PORT`: `10000`
4. Deploy! Express will serve the built React frontend from `frontend/dist` and handle WebSockets on the same port.
>>>>>>> 24f17d9 (Initial commit)
