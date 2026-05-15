# Velora AI

Velora AI is a premium, full-stack AI workspace built with a focus on high-performance streaming, modular provider integration, and intelligent long-term memory.

## 🚀 Features
- **Multi-Model Support**: Seamlessly switch between Gemini, OpenAI, and Claude.
- **Real-time Streaming**: Low-latency responses using Server-Sent Events (SSE).
- **Persistent Memory**: Advanced RAG (Retrieval-Augmented Generation) using Vector Search.
- **Multimedia Integration**: Upload images for AI vision processing and generate art with Flux.
- **Identity Portability**: Export your AI interactions and learned preferences as a structured summary.

## 🛠️ Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, Zustand.
- **Backend**: Node.js, Express, TypeScript, MongoDB, Cloudinary.
- **AI**: Google Gemini, OpenAI, Anthropic, NVIDIA Flux.

## 📁 Project Structure
- `client/`: The React-based frontend.
- `server/`: The Express-based backend.
- `.agents/workflows/`: Consolidated workspace for AI agent memory, knowledge, tasks, and development guides.

## 🚦 Quick Start

### 1. Prerequisites
- Node.js (v18+)
- MongoDB (Atlas recommended for Vector Search)
- API Keys: Gemini, Cloudinary, etc.

### 2. Installation
```bash
# Clone the repository
git clone <repo-url>
cd chat-bot-2

# Install dependencies
cd client && npm install
cd ../server && npm install
```

### 3. Running Locally
```bash
# Start backend
cd server && npm run dev

# Start frontend
cd client && npm run dev
```

## 📖 Documentation
Detailed technical guides can be found in:
- `CODE_FLOW.md`: Exhaustive logic breakdown.
- `AI_ARCHITECTURE.md`: Modular provider system explanation.
- `.agents/workflows/`: Interactive guides and persistent context (Memory, Knowledge, Tasks).
