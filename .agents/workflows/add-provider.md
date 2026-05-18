---
description: Step-by-step guide for adding a new AI provider to the Velora platform.
---

# Workflow: Adding a New AI Provider

This workflow guides you through the process of integrating a new LLM provider (e.g., Anthropic, Groq, or a local Llama instance).

## Step 1: Define the Adapter
Create a new file in `server/src/services/ai/providers/[provider].adapter.ts`.
It must implement the `IAIService` interface.

// turbo
```bash
# Example command to create the file
touch server/src/services/ai/providers/anthropic.adapter.ts
```

## Step 2: Implement the Interface
Ensure you implement `getProviderName`, `generateResponse`, and `generateStreamResponse`.
Streaming is mandatory for the "typing" effect.

## Step 3: Register in AIServiceFactory
Add the new adapter instance to `server/src/services/ai/ai.factory.ts`.

```typescript
import { AnthropicAdapter } from "./providers/anthropic.adapter";
// ...
providers: {
  gemini: new GeminiAdapter(),
  anthropic: new AnthropicAdapter(), // Add this
}
```

## Step 4: Environment Variables
Add the necessary API keys to the `.env` file in the `server` directory.

## Step 5: Verification
1. Restart the server.
2. Check `GET /api/ai/providers` to see if the new model appears.
3. Test a chat session in the frontend.
