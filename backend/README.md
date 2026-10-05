# ⚙️ SyncPlay Backend (Node.js + Express + WebSockets + PostgreSQL)

Standalone backend server for the YouTube Watch Party system.

## 📦 Features
- **Express REST API**: Health checks (`/api/health`) and room info endpoints (`/api/rooms/:roomId`).
- **Socket.IO Real-Time Server**: Low-latency WebSocket bidirectional communication.
- **Role-Based Access Control (RBAC)**: Backend permission validation for Host, Moderator, and Participant.
- **PostgreSQL Persistence**: Automatic table creation and asynchronous state synchronization using the cloud Render PostgreSQL database.
- **OOP Architecture**: Modular `Room`, `Participant`, and `RoomManager` models.

## 🚀 Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Run in development mode (auto-reload)
npm run dev

# 3. Run in production mode
npm start
```

## ⚙️ Environment Variables (`.env`)
```env
PORT=5000
DATABASE_URL=postgresql://you_tube_user:8CyczO1g4NwkzRCkF0GQ0UApEHwGSxCF@dpg-db16bprncjis73bd3bbg-a.oregon-postgres.render.com/you_tube
CLIENT_URL=http://localhost:5173
```
