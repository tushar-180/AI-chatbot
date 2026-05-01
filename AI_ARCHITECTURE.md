# AI Service Architecture & Streaming Flow

This document explains the modular AI architecture and real-time streaming implementation of the Chat-Bot application.

---

## 1. Core Architecture: The Adapter Pattern

The system is built using the **Adapter Pattern**, which decouples the core business logic (controllers/routes) from the specific implementations of AI providers (Google, OpenAI, Anthropic, etc.).

### Key Files:
- **`IAIService.ts`**: The standard interface that every AI provider must implement.
- **`AIServiceFactory.ts`**: The central registry that manages available providers and allows dynamic selection at runtime.
- **`providers/`**: Contains individual adapter classes (e.g., `GeminiAdapter`, `OpenAIAdapter`, `ClaudeAdapter`).

---

## 2. API Flow & Real-time Streaming

### Sequence of Events:
1.  **Provider Discovery**: The frontend calls `GET /api/ai/providers` to fetch the list of registered models and populates the selection dropdown.
2.  **Message Initiation**: When a user sends a message, the frontend calls the streaming endpoint (e.g., `POST /api/chat/stream`).
3.  **Persistence First**: The backend saves the user's message to MongoDB **immediately** before calling the AI. This ensures data is never lost if the AI service fails.
4.  **Streaming (SSE)**: 
    - The backend uses **Server-Sent Events (SSE)** to keep a connection open.
    - The selected Adapter yields tokens/chunks as they are generated.
    - The Controller pipes these chunks to the response object in real-time.
5.  **Frontend Rendering**: 
    - The frontend uses a `ReadableStream` to consume the SSE chunks.
    - It updates the UI character-by-character, showing a **blinking cursor** for a premium "typing" effect.

---

## 3. Key Improvements

- **Provider Agnostic**: You can switch from Gemini to Claude without changing a single line of controller code.
- **Low Latency**: Users see results as they happen, rather than waiting 10+ seconds for a full paragraph to generate.
- **Resilient**: If the AI crashes mid-stream, the user's message is already saved in the database.
- **Modular**: Each provider's logic is isolated in its own file, making it easy to test and maintain.

---

## 4. How to Add a New AI Model

Follow these steps to add a new provider (e.g., Llama/Groq):

### Step 1: Create the Adapter
Create a new file `server/src/services/ai/providers/llama.adapter.ts`:
```typescript
import { IAIService } from "../ai.interface";
import { AIMessage } from "../types";

export class LlamaAdapter implements IAIService {
  getProviderName(): string { return "llama"; }

  async generateResponse(messages: AIMessage[]) {
    // Implementation for standard response
  }

  async *generateStreamResponse(messages: AIMessage[]) {
    // Implementation for streaming (yield chunks)
  }
}
```

### Step 2: Register in the Factory
Open `server/src/services/ai/ai.factory.ts` and add your new adapter:
```typescript
import { LlamaAdapter } from "./providers/llama.adapter";

// inside AIServiceFactory.providers object:
llama: new LlamaAdapter(),
```

### Step 3: Configure Environment
Add your API keys for the new provider in your `.env` file.

**Done!** The new model will automatically appear in the frontend dropdown and be ready for streaming.
