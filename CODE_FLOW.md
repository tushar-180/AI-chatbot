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

## 🧠 Core Logic: AI Memory (Advanced RAG System)

Velora AI implements a state-of-the-art **Retrieval-Augmented Generation (RAG)** system that enables "Long-Term Memory." This allows the assistant to learn about the user and recall that information months later.

### 1. Ingestion: Parallel Memory Extraction
Every user message undergoes background analysis to "learn" new information:
- **Extraction**: A specialized prompt uses Gemini to identify personal facts, preferences, or technical details from the message.
- **Categorization**: Facts are tagged as `personal`, `preference`, `technical`, `work`, or `general`.
- **Parallel Processing**: Extracted facts are processed and saved concurrently using **`Promise.all`**, ensuring the chat flow remains uninterrupted and fast.

### 2. Vectorization: Standardized 768-D Embeddings
To enable semantic search, text must be converted into math:
- **Model**: Uses `gemini-embedding-001` (or `text-embedding-004`).
- **Standardization**: All embeddings are forced to **768 dimensions** for consistency across different chat providers.
- **Self-Healing Logic**: The system automatically detects and repairs memories with missing or incorrectly dimensioned vectors (e.g., from old chat providers) whenever they are accessed.

### 3. Retrieval: Importance-Boosted Search
When a user sends a message, the system performs a multi-stage retrieval:
1. **Identity Injection**: "Personal" category memories (identity, name) are always retrieved first to maintain persona consistency.
2. **Vector Search**: The system searches the MongoDB Atlas Vector Index for the most semantically relevant facts.
3. **Importance Boosting**: Retrieval is not just based on similarity. It uses the algorithm:
   `FinalScore = SemanticSimilarity * ImportanceLevel`
   This ensures that a "Critical" fact (Importance 5) bubbles to the top even if it is only a partial match.

### 4. Augmentation: Token-Aware Context Injection
The retrieved facts are injected into the **System Prompt** before sending the request to the AI:
- **Token Control**: To prevent "Prompt Bloat" and save costs, the context is limited by a **Character Window (~2500 chars)**.
- **Subtle Integration**: The system instructions specifically tell the AI to use these memories **naturally and subtly**, avoiding robotic phrases like "I remember that..." or repeating facts back to the user.

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
