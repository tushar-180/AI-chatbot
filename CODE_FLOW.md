# Velora AI: Full-Stack System Architecture & Core Logic

This document provides an exhaustive technical breakdown of the Velora AI project, covering its architecture, database design, and the complex logic behind its real-time features.

---

## 🏗️ System Architecture

Velora AI is built as a high-performance, real-time AI workspace using a modern tech stack.

### 1. Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, Zustand, Clerk (Auth).
- **Backend**: Node.js, Express, TypeScript, Mongoose.
- **Infrastructure**: MongoDB (Database), Cloudinary (Image Hosting).
- **AI Engines**: Google Gemini (Text & Vision), NVIDIA Flux (Image Generation).

### 2. Frontend Organization (Feature-Driven)
The client is divided into modular custom hooks that isolate complex logic:
- `useChatStream`: Manages SSE connections, optimistic UI, and stream recovery.
- `useChatInput`: Handles user input state, model switching, and attachment management.
- `useChatMessages`: Orchestrates the retrieval and syncing of conversation history.
- **State Store**: `useChatStore.ts` (Zustand) acts as the single source of truth for the UI.

### 3. Backend Organization (Service-Repository)
- **Controllers**: Handle HTTP/SSE lifecycle (e.g., setting headers, piping streams).
- **Services**: Contain business logic (e.g., `chat.service.ts` for workflow, `ai.service.ts` for model abstraction).
- **Repositories**: Abstract database operations using Mongoose models.
- **Stream Registry**: `chatStreamRegistry.service.ts` tracks active server-side AI processes.

---

## 🗄️ Database Design (MongoDB)

To ensure scalability and performance, the database uses a two-collection schema rather than embedding all messages inside a single chat document.

### 1. `Chat` Collection
Stores metadata about the conversation.
- `userId`: Clerk ID of the owner.
- `title`: Dynamic or user-defined title.
- `timestamps`: Track creation and last update for sorting in the sidebar.

### 2. `Message` Collection
Stores individual interactions, linked by `chatId`.
- `role`: `user`, `assistant`, or `system`.
- `content`: The message text.
- `status`: `streaming`, `completed`, `stopped`, or `failed`.
- `attachments`: Array of URLs and metadata for uploaded/generated images.
- `requestId`: A unique UUID used to sync frontend and backend during streaming.

---

## 🌊 Core Logic: Real-time Streaming (SSE)

The "typing" effect is achieved through **Server-Sent Events (SSE)**.

1. **Initiation**: The frontend sends a `fetch` request with `Accept: text/event-stream`.
2. **SSE Setup**: The server sets headers (`Connection: keep-alive`, `Cache-Control: no-cache`) to keep the pipe open.
3. **Async Generation**: The backend uses an `AsyncGenerator` to `yield` text chunks as they arrive from the AI provider.
4. **Piping**: The controller writes these chunks into the response stream in the format `data: {...}\n\n`.
5. **Consumption**: The frontend reads the `ReadableStream`, decodes the binary data, and updates the Zustand store in real-time.

---

## 🧠 Core Logic: AI Memory (Vector Search / RAG)

Velora AI features a sophisticated long-term memory system that allows it to remember user facts across sessions.

### 1. Memory Extraction (Learning)
After every user message, a background service uses Gemini to analyze the text. If new facts (personal, preferences, technical) are found, they are extracted and categorized.

### 2. Semantic Embedding
Each extracted fact is converted into a **768-dimensional vector** using the `text-embedding-004` model. This "embedding" represents the mathematical meaning of the text.

### 3. Vector Retrieval (RAG)
When a user sends a message, the system:
1.  Generates a vector for the **current message**.
2.  Performs a **Vector Search** in MongoDB Atlas to find conceptually similar memories.
3.  Injects the most relevant memories into the AI's system prompt.
4.  **Identity Persistence**: Always includes "personal" category facts (like name) to ensure the AI never forgets who it is talking to.

---

## 🛑 Core Logic: Stopping Generation

Stopping a response mid-way requires synchronization across three layers:

1. **Frontend**: Calls `abort()` on a local `AbortController` (stopping the `fetch`) and sends a `/stop` request to the backend.
2. **Backend Registry**: The server finds the active AI process in the `chatStreamRegistry` using the `requestId`.
3. **AI Adapter**: The backend triggers an `AbortSignal` inside the AI provider loop (e.g., Gemini), causing it to exit the stream immediately.
4. **Persistence**: The server saves the partial response received so far to MongoDB with `status: "stopped"`.

---

## 🖼️ Core Logic: Image Handling

### 1. Uploading (User Images)
- **Path**: `InputArea` → `/api/upload/image` → `CloudinaryService` → **Cloudinary**.
- **Result**: The frontend receives a public URL and stores it in the `attachments` state.

### 2. AI Vision Processing
- When a message with images is sent, the **AI Adapter** fetches the image from the Cloudinary URL.
- It converts the image to **Base64** and sends it as `inlineData` to the Gemini API.

### 3. AI Image Generation
- If the AI generates an image (e.g., via NVIDIA Flux), the backend parses the response for image URLs.
- These are saved as `attachments` in the `Message` document and displayed in the frontend `MessageList` and `GalleryModal`.

---

## 🚀 Runtime Execution Flow (Step-by-Step)

1. **Input**: User types "What is this?" and attaches an image.
2. **Upload**: Image is uploaded to Cloudinary; URL is returned to the client.
3. **Submit**: Client sends text + image URL + a unique `requestId` to the server.
4. **Optimistic UI**: Client instantly displays the user message and a loading spinner.
5. **Stream**: Server starts the AI stream; client updates the UI character-by-character.
6. **Completion**: Server saves the final text to the database; client "commits" the message.
