# Chatbot-Group — Project Analysis

> **Date:** May 27, 2026  
> **Type:** Full-Stack AI Chat Application with Group Features, File RAG, Web Search, and MCP Tools  
> **Stack:** Node.js/Express + React (Vite) + MongoDB (Mongoose) + SSE Streaming + Multi-LLM Support

---

## 📊 Overall Rating: 8.5 / 10

| Dimension | Score | Notes |
|---|---|---|
| **Architecture** | 9/10 | Clean layered architecture with service/repository/controller pattern; well-modularized |
| **Feature Depth** | 9/10 | Multi-LLM, RAG, web search, group chats, MCP tools, memo, shared chats |
| **Code Quality** | 8/10 | Strong TypeScript usage; some inconsistency in error handling patterns |
| **Scalability** | 7/10 | SSE for streaming is good; MongoDB chosen; no caching layer on responses |
| **UI/UX** | 8/10 | Polished React app with shadcn/ui, modals, sidebars — well-executed |
| **Testing** | 4/10 | No test files found in the codebase |
| **Documentation** | 7/10 | `AI_ARCHITECTURE.md`, `CODE_FLOW.md`, `README.md` exist but are minimal |
| **Security** | 8/10 | Clerk authentication, middleware guards, rate limiting on web search |

---

## 🏗️ Architecture Overview

### High-Level Structure

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (React + Vite)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ Chat UI  │ │ Sidebar  │ │ Modals   │ │ Stores │  │
│  └────┬─────┘ └──────────┘ └──────────┘ └────────┘  │
│       │           HTTP + SSE (Server-Sent Events)     │
└───────┼─────────────────────────────────────────────┘
        │
┌───────┼─────────────────────────────────────────────┐
│  SERVER (Express + TypeScript)                        │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐    │
│  │ Routes   │→│Controllers│→│ Services (Core)   │    │
│  └──────────┘ └──────────┘ └────────┬──────────┘    │
│       │                              │               │
│  ┌────┴────┐            ┌───────────┴──────────┐    │
│  │Middleware│            │   AI Service Layer    │    │
│  │(Auth,   │            │  ┌─────────────────┐  │    │
│  │ Error)  │            │  │  AI Factory      │  │    │
│  └─────────┘            │  │  ├─ GeminiAdapter │  │    │
│                         │  │  ├─ OpenAIAdapter │  │    │
│  ┌─────────────────┐    │  │  ├─ ClaudeAdapter │  │    │
│  │  Modules         │    │  │  └─ NvidiaAdapter │  │    │
│  │  ├─ Web Search   │    │  └─────────────────┘  │    │
│  │  ├─ File RAG     │    │                       │    │
│  │  ├─ YouTube Tool │    │  ┌─────────────────┐  │    │
│  │  └─ MCP Client   │    │  │ Chat Service    │  │    │
│  └─────────────────┘    │  │ Memory Service   │  │    │
│                         │  │ GroupChat Service│  │    │
│  ┌─────────────────┐    │  │ SharedChat Ser.  │  │    │
│  │ Repositories     │    │  └─────────────────┘  │    │
│  │  ├─ Chat Repo   │    └───────────┬──────────┘    │
│  │  └─ Project Repo│                │               │
│  └─────────────────┘    ┌───────────┴──────────┐    │
│                         │    MongoDB (Mongoose)  │    │
│                         │    + Supabase (Vector) │    │
│  ┌─────────────────┐    └───────────────────────┘    │
│  │  Stream Registry │                                │
│  │  (SSE mgmt)     │                                │
│  └─────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

### Architectural Pattern — Layered Modular

The application follows a **Controller → Service → Repository** pattern:

1. **Routes** — Define HTTP endpoints, wire middleware
2. **Controllers** — Thin handlers: parse request, call service, format response
3. **Services** — Business logic, orchestration of AI providers, web search, RAG, etc.
4. **Repositories** — Data access layer (Mongoose models)
5. **Models** — Mongoose schemas (Chat, GroupChat, User, Project, etc.)

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **SSE for streaming** | Simpler than WebSockets for unidirectional server→client streaming; works with standard HTTP |
| **AI Factory Pattern** | Allows plugging in new LLM providers without changing consumer code |
| **Dedicated Stream Registries** | Decouples stream lifecycle from chat services — enables abort/stop per-stream |
| **Supabase + MongoDB** | MongoDB for primary data; Supabase pgvector for file embedding storage |
| **Separate AI Providers** | Each provider (Gemini, OpenAI, Claude, NVIDIA) implements a common `AiProvider` interface |
| **Clerk Auth** | External auth provider reduces security surface area |

---

## 🔧 How Important Features Work

### 1. Multi-LLM Chat Streaming

The core feature — users send messages and get real-time streaming responses from multiple LLM providers.

**Flow:**
1. Client sends message via `POST /:id/stream` (with optional file attachment)
2. `ChatController.streamMessage()` calls `ChatService.streamMessage()`
3. `ChatService` builds the conversation history (system prompt + prior messages + optional memory/context) using `chatHistory.ts`
4. Calls `aiService.generateResponseStream()`
5. `AiService` uses **AI Factory** (`ai.factory.ts`) to get the correct provider adapter
6. The adapter calls the LLM API and pipes chunks back via an event emitter
7. `ChatService` writes each chunk to an SSE response and persists to MongoDB at the end
8. The `ChatStreamRegistry` tracks active streams for abort support (via `POST /stop`)

**Supported Providers:**
- **Gemini** (`gemini.adapter.ts`) — Uses Google's Gemini API; primary/default provider
- **OpenAI** (`openai.adapter.ts`) — GPT-4o, o3, etc.
- **Claude** (`claude.adapter.ts`) — Anthropic Claude models
- **NVIDIA** (`nvidia.adapter.ts`) — NVIDIA NIM API

```typescript
// ai.factory.ts — Provider resolution
function getAiProvider(model: string): AiProvider {
  if (model.startsWith('gemini')) return new GeminiAdapter();
  if (model.startsWith('gpt') || model.startsWith('o')) return new OpenAIAdapter();
  if (model.startsWith('claude')) return new ClaudeAdapter();
  if (model.startsWith('nvidia')) return new NvidiaAdapter();
  throw new Error(`Unknown model: ${model}`);
}
```

### 2. Group Chat

Multi-user chat rooms with real-time collaboration.

**Flow:**
1. User creates a group via `POST /group/create` — generates an invite code
2. Other users join via invite code or invite link (`/join/:inviteCode`)
3. Messages are sent via `POST /:groupId/message` with optional file uploads
4. Streaming responses are broadcast to all group members via SSE
5. `GroupStreamRegistry` manages per-group SSE connections for fan-out
6. Reactions, pinning, and member management are supported

**Key models:** `GroupChat` schema with members array, messages sub-document, invite codes.

### 3. Web Search Augmentation

Retrieves real-time web data to augment LLM responses.

**Flow:**
1. User enables "web search" toggle in the chat input
2. When sending a message, the `webSearchFlg` flag is set
3. `ChatService` calls `webSearchService.search()`
4. The search module:
   - **Query Resolver** (`queryResolver.ts`) — Reformulates the user query for better search results
   - **Cache** (`cache.ts`) — In-memory LRU cache to avoid duplicate queries
   - **Rate Limiter** (`rateLimiter.ts`) — Token bucket algorithm to prevent API abuse
   - **Confidence Scoring** (`confidence.ts`) — Scores result relevance
   - **Reranker** (`reranker.ts`) — Reranks results for diversity and relevance
5. Results are formatted into a system prompt appendix with citations
6. LLM generates response with web-backed citations shown in the UI

### 4. File RAG (Retrieval-Augmented Generation)

Enables asking questions about uploaded documents (PDFs, text files, spreadsheets, etc.).

**Flow:**
1. User uploads a file with their message
2. `FileHandler` processes the file:
   - `FileParser` extracts text (PDF, CSV, JSON, DOCX, XLSX, images via OCR)
   - `TextSplitter` chunks the text into overlapping segments
3. `EmbeddingService` generates vector embeddings for each chunk (via Supabase pgvector)
4. `SupabaseStorageService` stores embeddings + original text in Supabase
5. On subsequent queries, `FileRetrieval` does similarity search against stored embeddings
6. Relevant chunks are injected into the LLM context as grounding material

### 5. Memory / Personalization

Persistent user memory for personalized AI interactions.

- **Memory model** (`UserMemory.model.ts`) — Stores key-value pairs of user information
- **Memory service** (`memory.service.ts`) — CRUD for user memories
- During chat, relevant memories are fetched and injected into the system prompt
- Users can view/edit memories via a modal in the UI (`MemoryModal.tsx`)
- Supports auto-extraction of memories from conversations

### 6. YouTube Transcript Tool

A specialized tool that extracts YouTube video transcripts and feeds them into the LLM context.

- `youtube/transcript.ts` — Fetches and parses YouTube transcripts
- Allows users to ask questions about video content
- Integrates into the chat flow as an optional context source

### 7. MCP (Model Context Protocol) Integration

Extensible tool-calling framework:

- **MCP Client** (`mcpClient.service.ts`) — Connects to MCP servers for external tool execution
- **MCP Server Model** (`McpServer.model.ts`) — Stores registered MCP server configurations
- **Admin UI** (`McpAdminTab.tsx`, `McpServerCard.tsx`, `McpServerModal.tsx`) — Manage MCP servers
- Currently implements Excel/CSV file analysis via an MCP server
- Architecture allows adding new tool servers modularly

### 8. Shared Chats & Forking

Users can share chat histories and fork from shared chats.

- `POST /:chatId/share` — Creates a shareable link
- `GET /:sharedChatId` — Public view of shared chat
- `POST /:sharedChatId/fork` — Creates a new chat from a shared one (user's copy)
- `SharedChatPage.tsx` — Public-facing read-only view
- `ShareModal.tsx` — UI for managing shares

### 9. Projects & Project Context

Organize chats into projects with context building.

- **Project model** — Contains files, chats, metadata
- **Project Service** (`project.service.ts`) — CRUD, file management
- **Build Project Context** (`buildProjectContext.ts`) — Aggregates project files into LLM context
- **File RAG integration** — Project files are indexed and searchable
- UI via `Sidebar.tsx`, `ProjectsDashboardPage.tsx`

### 10. Streaming Architecture (SSE)

Server-Sent Events for real-time token streaming:

- **Server side:** Response is set as `Content-Type: text/event-stream`. Chunks are written as SSE `data:` lines. A keepalive mechanism prevents connection drops. End-of-stream signals finalize the message and persist to DB.
- **Client side:** `useChatStream.ts` / `useGroupChat.ts` hooks manage `EventSource` connections, buffer chunks, and update the store incrementally.
- **Abort support:** `ChatStreamRegistry` stores active `AbortController` references mapped by chat ID. POST `/stop` triggers abort.
- **Stream Updates:** `GET /:id/stream-updates` provides a secondary SSE endpoint for metadata updates (e.g., token usage).

---

## 📁 Database Schema

### MongoDB Collections (via Mongoose)

| Model | Key Fields | Purpose |
|---|---|---|
| `User` | clerkId, email, name, image | User profiles synced from Clerk |
| `Chat` | userId, title, messages[], model, projectId | Individual chat sessions |
| `GroupChat` | name, members[], messages[], inviteCode, createdBy | Group chat rooms |
| `UserMemory` | userId, memories[] | Key-value memories per user |
| `McpServer` | name, url, apiKey, tools[] | Registered MCP tool servers |
| `Project` | userId, name, files[], chats[] | Project containers |
| `SharedChat` | originalChatId, sharedBy, messages[] | Publicly shared chats |

### Supabase (pgvector)

| Table | Purpose |
|---|---|
| `file_embeddings` | Vector embeddings for file chunks (used in RAG) |

---

## 🔌 API Endpoints Summary

### Chat Routes (`/api/chat`)
| Method | Path | Description |
|---|---|---|
| POST | `/` | Create new chat |
| POST | `/stream` | Create chat with streaming |
| POST | `/stop` | Abort active stream |
| POST | `/:id` | Send message (non-streaming) |
| POST | `/:id/stream` | Send message (streaming) |
| GET | `/:id/stream-updates` | SSE updates for stream |
| GET | `/` | List all chats |
| GET | `/search` | Search chats |
| GET | `/gallery` | Gallery view of images |
| GET | `/:id` | Get single chat |
| DELETE | `/:id` | Delete chat |
| POST | `/:id/archive` | Archive chat |
| POST | `/:id/pin` | Pin chat |

### Group Chat Routes (`/api/group`)
| Method | Path | Description |
|---|---|---|
| POST | `/create` | Create group |
| GET | `/user-groups` | List user's groups |
| GET | `/invite/:inviteCode` | Get group by invite code |
| POST | `/join/:inviteCode` | Join group |
| GET | `/:groupId/messages` | Get group messages |
| POST | `/:groupId/message` | Send group message |
| POST | `/:groupId/stop` | Stop group stream |
| POST | `/:groupId/reactions` | Add/remove reaction |

### Other Routes
| Module | Routes |
|---|---|
| **AI** | `/api/ai/providers` |
| **User** | `/api/user/profile` (GET/PUT) |
| **Memory** | `/api/memory` (GET/DELETE) |
| **Web Search** | `/api/web-search/quota-status` |
| **Shared Chat** | `/api/shared/share`, `/api/shared/user/shares`, `/api/shared/:id`, `/api/shared/:id/fork` |
| **Project** | `/api/project` CRUD |
| **MCP** | `/api/mcp` CRUD |
| **Admin** | `/api/admin/stats` |
| **Upload** | `/api/upload/image` |

---

## 🎨 Client Architecture

### Tech Stack
- **React 18** with TypeScript
- **Vite** for build tooling
- **Zustand** for state management (per-feature stores)
- **shadcn/ui** component library (Radix primitives + Tailwind CSS)
- **React Router** for routing
- **Clerk** for authentication

### Key Components

| Component | Purpose |
|---|---|
| `ChatLayout.tsx` | Main chat shell — sidebar + message list + input |
| `InputArea.tsx` | Chat input with file upload, web search toggle, model selector |
| `MessageList.tsx` | Virtualized message list with auto-scroll |
| `MessageItem.tsx` | Single message renderer with markdown, code blocks, images |
| `Sidebar.tsx` | Chat history, search, grouping, pinning |
| `GroupInputArea.tsx` | Group-specific input with member awareness |
| `CodeBlock.tsx` | Syntax-highlighted code with copy button |

### State Management (Zustand Stores)
- `useChatStore` — Current chat messages, loading states
- `useGroupStore` — Group chat state
- `useComposerStore` — Input area state
- `useProjectStore` — Project state
- `useSelectionStore` — Text selection for editing
- `useTemporaryChatStore` — Temp chat state

### Hooks
- `useChatStream.ts` — SSE connection management with reconnection logic
- `useGroupChat.ts` — Group chat SSE with fan-out
- `useChatList.ts` — Chat history listing
- `useWebSearchQuota.ts` — Web search rate limit tracking
- `useVoiceInput.ts` — Speech-to-text input
- `useTextSelection.ts` — Select text for edit/reply

---

## 🧩 Module Deep Dives

### Web Search Module (`server/src/modules/web-search/`)
```
webSearch.service.ts  ── Main orchestrator
cache.ts              ── LRU cache (dedup)
rateLimiter.ts        ── Token bucket rate limiter
queryResolver.ts      ── Query reformulation
reranker.ts           ── Result diversity reranker
confidence.ts         ── Relevance confidence scoring
webSearch.prompts.ts  ── LLM prompts for search
webSearch.types.ts    ── Type definitions
quotaStatus.ts        ── Quota management
```

### File RAG Module (`server/src/modules/file-rag/`)
```
index.ts              ── Main orchestrator
fileHandler.ts        ── File type detection & processing
fileParser.ts         ── Text extraction from various formats
fileRetrieval.ts      ── Embedding similarity search
textSplitter.ts       ── Chunking logic
types.ts              ── Type definitions
services/
  embedding.service.ts    ── Vector embedding generation
  supabaseStorage.service.ts ── Supabase vector store
config/
  supabase.ts             ── Supabase client config
```

### YouTube Tool (`server/src/modules/tools/youtube/`)
```
index.ts              ── Exports & orchestration
transcript.ts         ── Fetches YouTube transcripts
types.ts              ── Type definitions
```

---

## 💪 Strengths

1. **Multi-Provider AI** — Not locked into one LLM; factory pattern makes adding providers trivial
2. **Real-time Streaming** — SSE implementation is clean with proper abort support and stream registry
3. **Rich Context Augmentation** — Web search, file RAG, YouTube transcripts, and memory all feed into a unified context
4. **Group Chat** — Full-featured with invite codes, member management, reactions, pinning
5. **File RAG Pipeline** — End-to-end from file upload to chunking to embedding to retrieval
6. **Modern Client Architecture** — Zustand stores, shadcn/ui components, well-organized hooks
7. **Extensibility** — MCP tool system allows plugging in arbitrary external tools
8. **Code Organization** — Clean separation of concerns with dedicated services, controllers, repositories

## 🔧 Areas for Improvement

1. **No Tests** — Zero test files found across the entire codebase. Critical for reliability.
2. **Error Handling Inconsistency** — Some controllers use `asyncHandler` wrapper, others do try/catch manually
3. **No Response Caching** — No Redis or in-memory caching for frequent queries or provider responses
4. **SSE Connection Limits** — Each chat tab opens a new SSE connection; no connection pooling
5. **Memory Extraction** — No automated memory extraction from conversations (currently manual)
6. **No TypeScript Path Aliases** — Deep relative imports like `../../services/ai.service.ts` throughout
7. **Documentation** — `AI_ARCHITECTURE.md` and `CODE_FLOW.md` are sparse; inline JSDoc is minimal
8. **No CI/CD Pipeline** — No GitHub Actions or similar found in config
9. **No Rate Limiting on Chat API** — Only web search has rate limiting; chat endpoints are unguarded
10. **Monitoring** — No structured logging or APM integration visible

---

## 🚀 Scalability Notes

- **Horizontal scaling:** SSE connections are in-memory — would need a pub/sub layer (Redis) for multi-instance deployments
- **MongoDB:** Single replica set assumed; would need sharding for massive chat volumes
- **Supabase Vector:** Scales reasonably well with pgvector indexing
- **Client:** Static build via Vite — can be served via CDN easily
- **Stream Registry:** In-memory `Map<string, AbortController>` — lost on server restart

---

## 📐 Code Quality Observations

- **TypeScript usage:** Strong throughout both client and server with proper interfaces and types
- **Naming conventions:** Consistent camelCase, PascalCase for types/interfaces
- **File organization:** Feature-based on client, layer-based on server — sensible
- **Code reuse:** Good — `asyncHandler`, stream registries, utility functions are properly centralized
- **Import style:** ES module imports throughout (no require())
- **Async/await:** Consistent async patterns; proper error propagation
- **Environment config:** Centralized in `constants/` and config files

---

## ✅ Summary

This is a **production-grade AI chat application** with sophisticated features beyond basic chatbot functionality. The architecture is well-thought-out with clear separation of concerns. The multi-provider AI layer, file RAG pipeline, web search augmentation, and MCP tool integration make it a versatile platform.

**Best for:** Teams wanting a customizable AI chat platform with group collaboration, file understanding, and tool integration capabilities.

**Rating: 8.5/10** — Strong architecture and feature depth; held back by lack of testing and some missing production hardening.
