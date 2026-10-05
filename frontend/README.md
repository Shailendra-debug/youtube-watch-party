# 🎨 SyncPlay Frontend (React + Vite + Tailwind CSS)

Standalone client application for the YouTube Watch Party system.

## 📦 Features
- **YouTube IFrame API Integration**: Synchronized playback without feedback cascade loops.
- **Role-Aware UI**: Host controls (play, pause, scrub, video switcher, promote/demote/kick), participant watch-only mode with permission request flow.
- **Real-Time Room Chat**: Live text chat with role badges and message history.
- **Floating Animated Reactions**: Real-time emoji bursts (🔥, ❤️, 😂, 👏, 🍿, 🚀).
- **One-Click Share**: Instant room code and invite link sharing.

## 🚀 Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Start Vite development server
npm run dev

# 3. Build production bundle
npm run build
```

## ⚙️ Environment Variables (`.env`)
```env
VITE_SERVER_URL=http://localhost:5000
```
