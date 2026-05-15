---
description: Technical patterns, codebase quirks, and critical file mappings for Velora AI.
---

# Codebase Knowledge Base: Velora AI

## 🛠️ Technical Patterns & Standards

### 1. Adding a New AI Provider
- **Location**: `server/src/services/ai/providers/`
- **Interface**: Must implement `IAIService`.
- **Registration**: Add the instance to the `providers` object in `AIServiceFactory.ts`.
- **Streaming**: Must use `async *` generator yielding `ChatChunk` objects.

### 2. Frontend State Management
- **Zustand**: Primary store is `useChatStore.ts`.
- **Streaming Hooks**: `useChatStream.ts` manages the lifecycle of an SSE request.
- **Media Sync**: Gallery items are fetched from `/api/user/media` and mapped to parent `chatId` for navigation.

### 3. Backend SSE implementation
- **Headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- **Data Format**: Every chunk must be stringified JSON prefixed with `data: ` and followed by `\n\n`.
- **Interruption**: Backend must listen for `req.on('close')` or a manual `/stop` request to abort the AI service via `AbortController`.

## 🔍 Repository Quirks & Gotchas

- **MongoDB Collections**:
  - `chats`: Metadata, title, timestamps.
  - `messages`: Actual content, role, attachments.
  - `user_memories`: Vectorized facts for RAG.
- **Environment Variables**:
  - `CLOUDINARY_URL`: Required for image uploads.
  - `GEMINI_API_KEY`: Primary AI engine.
  - `MONGODB_URI`: Must support Vector Search (Atlas recommended).
- **Styling**: Uses Tailwind CSS with custom animation configurations in `tailwind.config.js`.

## 📂 Critical File Map

- `server/src/services/ai/ai.factory.ts`: The central AI orchestrator.
- `client/src/features/chat/hooks/useChatStream.ts`: The complex stream consumption logic.
- `server/src/services/chat.service.ts`: Orchestrates message persistence and AI triggering.
- `server/src/models/UserMemory.model.ts`: Defines the schema for RAG facts and embeddings.
- `client/src/features/chat/components/Sidebar.tsx`: Handles the Tab-switching logic (Chats vs Media).
