# Chat Bot Code Flow and Functionality

This document explains the structure and runtime flow of the chat bot project in a simple, easy-to-follow way.

---

## Overview

The project is built as a full-stack chat application:
- `client/` contains a React + Vite frontend.
- `server/` contains an Express backend with MongoDB storage.
- The backend uses Google Gemini AI via `@google/genai` to generate assistant responses.

The chat app supports:
- user authentication via Clerk
- creating new chat sessions
- continuing existing conversations
- storing messages in MongoDB
- deleting chat sessions

---

## Frontend Architecture

### Main entry
- `client/src/App.tsx`
- Loads the app and decides routing.
- Uses Clerk's `useUser()` to check if the user is signed in.
- Protects the chat route and redirects unauthenticated users to `/auth`.

### Authentication
- `client/src/pages/Auth.tsx`
- Displays Clerk's `SignIn` component.
- Keeps the login flow separate from the chat UI.

### Chat UI
- `client/src/pages/Chat.tsx`
- Main chat interface.
- Handles message input, submission, and display.
- Uses `useChatStore` to manage client state.
- Fetches messages for the selected chat and renders them with user/assistant styling.

### Sidebar
- `client/src/components/custom/Sidebar.tsx`
- Displays recent chat threads.
- Allows the user to start a new chat or select an existing one.
- Deletes chats using the backend API.
- Fetches the chat list automatically when the user logs in.

### Client state
- `client/src/store/useChatStore.ts`
- Uses Zustand for global chat state.
- State includes:
  - `chats`: list of chat threads
  - `currentChatId`: currently selected chat
  - `messages`: current chat messages
  - `loading`: whether the app is waiting for a response
  - `isNewChat`: whether the user started a fresh chat
  - `sidebarOpen`: mobile sidebar state

### API helper
- `client/src/lib/api.ts`
- Creates an Axios instance with `baseURL` set to `http://localhost:5000/api`.
- All frontend calls to the backend use this shared client.

---

## Backend Architecture

### Server startup
- `server/src/server.ts`
- Loads environment variables using `dotenv`.
- Connects to MongoDB via `connectDB()`.
- Starts Express on `process.env.PORT` or `6000`.

### Express app
- `server/src/app.ts`
- Configures middleware:
  - `cors()`
  - `express.json()`
  - `morgan("dev")` for request logging
- Adds a health route at `/`.
- Mounts chat routes at `/api/chat`.

### Data model
- `server/src/models/Chat.model.ts`
- Defines a `Chat` document with:
  - `userId`: the authenticated user
  - `title`: chat title
  - `messages`: array of `ChatMessage`
- Each `ChatMessage` includes:
  - `role`: either `user` or `assistant`
  - `content`: text message content

### Routes
- `server/src/routes/chat.routes.ts`
- Exposes REST endpoints:
  - `POST /api/chat` — create a new chat
  - `POST /api/chat/:id` — add a message to an existing chat
  - `GET /api/chat` — list chats for a user
  - `GET /api/chat/:id` — retrieve a specific chat
  - `DELETE /api/chat/:id` — delete a chat

### Chat controller
- `server/src/controllers/chat.controller.ts`
- Implements backend logic for each route.
- Key controller behaviors:
  - `createChat`: creates a new chat, sends the first user message to Gemini, stores the assistant reply.
  - `sendMessage`: appends a user message to an existing chat, sends full history to Gemini, stores the assistant reply.
  - `getAllChats`: fetches chat list for the user.
  - `getChatById`: fetches a single chat by ID.
  - `deleteChat`: removes a chat from MongoDB.

### Gemini service
- `server/src/services/gemini.service.ts`
- Wraps Gemini AI calls and error handling.
- Uses `GEMINI_API_KEY` and optionally `GEMINI_MODEL`.
- Converts chat history into plain text prompt lines.
- Calls `ai.models.generateContent()`.
- Returns the AI-generated assistant response.
- Throws `GeminiServiceError` for rate limits or service failures.

---

## Runtime Flow

### 1. User login and navigation
1. User opens the app.
2. `App.tsx` checks auth state.
3. If signed in, user sees the `Chat` page.
4. If not signed in, user is redirected to `/auth`.

### 2. Loading chat sessions
1. `Sidebar` fetches all chats via `GET /api/chat?userId=<user.id>`.
2. The backend returns chats sorted by `updatedAt` descending.
3. Sidebar displays chat titles and allows selection.

### 3. Starting a new chat
1. User clicks `New Chat`.
2. `Sidebar` sets `isNewChat = true` and clears current messages.
3. Chat page shows the message composer.
4. On submit, if there is no current chat ID, frontend sends `POST /api/chat`.
5. Backend creates a new chat and generates a first assistant reply.
6. The full chat is returned and stored in frontend state.

### 4. Continuing an existing chat
1. User selects a chat from the sidebar.
2. Frontend loads chat messages with `GET /api/chat/:id`.
3. User types a message and submits the form.
4. Frontend sends `POST /api/chat/:id` to append the message.
5. Backend sends the full chat history to Gemini.
6. Gemini returns a response, which is stored and returned.
7. Frontend updates the message list and chat title if needed.

### 5. Deleting a chat
1. User clicks delete on a chat entry in `Sidebar`.
2. Frontend calls `DELETE /api/chat/:id`.
3. Backend removes the chat document.
4. Frontend removes it from state and closes it if it was active.

---

## Important Environment Variables

The backend requires:
- `MONGO_URI` — MongoDB connection string
- `GEMINI_API_KEY` — Google Gemini API key
- `GEMINI_MODEL` — optional model name, defaults to `gemini-2.5-flash`
- `PORT` — optional server port

> Note: the frontend Axios base URL is set to `http://localhost:5000/api` in `client/src/lib/api.ts`.
> If the backend is running on a different port, update `client/src/lib/api.ts` or set `PORT=5000` for the server.

---

## Key behavior details

- The frontend keeps local chat state in `useChatStore` so the UI updates instantly.
- The backend stores every message in MongoDB, preserving full conversation history.
- Each assistant response is generated from the entire chat history.
- Chat titles are created from the first user message if no title already exists.

---

## Running the project

From the project root:
```bash
npm run dev
```

This starts both:
- `client` on Vite
- `server` with `ts-node-dev`

If the server is not using port `5000`, adjust the frontend's Axios base URL.

---

## Summary

This project is a standard chat app with:
- protected frontend routes via Clerk
- a React chat interface plus sidebar navigation
- a backend API that stores messages and calls Gemini
- a chat message model that keeps both user and assistant content

The flow is:
1. user signs in
2. frontend loads chat list
3. user sends a message
4. backend stores it and asks Gemini for the reply
5. frontend displays the full conversation
