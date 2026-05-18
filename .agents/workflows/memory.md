---
description: Persistent architectural memory and key decisions for Velora AI.
workflow: memory
---

# Agent Memory: Velora AI (Antigravity Workspace)

This file serves as the long-term persistent memory for the AI coding assistant (Antigravity). It preserves architectural context, core design philosophies, and critical technical decisions to ensure continuity across development sessions.

## 🌟 Project Essence
**Velora AI** is a premium, high-performance AI workspace designed for seamless interaction with multiple LLM providers. It focuses on real-time streaming, sophisticated semantic memory (RAG), and a high-fidelity user interface.

## 🏗️ Architectural Pillars

### 1. The Adapter Pattern (Provider-Agnostic)
- **Decoupling**: The system abstracts AI logic through the `IAIService` interface.
- **Factory Pattern**: `AIServiceFactory` manages provider registration and selection.
- **Current Adapters**: Gemini (Primary), OpenAI, Claude.
- **Ease of Extension**: Adding a new model only requires implementing the adapter and registering it in the factory.

### 2. Real-time Streaming (SSE)
- **Protocol**: Server-Sent Events (SSE) for low-latency, unidirectional communication.
- **State Management**: Frontend uses custom hooks (`useChatStream`) and Zustand to handle incremental state updates and "typing" effects.
- **Reliability**: Partial responses are cached and saved to MongoDB to prevent data loss.

### 3. Long-Term Memory (RAG & Vector Search)
- **Extraction**: Background service extracts facts from user messages using Gemini.
- **Embedding**: Facts are vectorized using `text-embedding-004` (768 dimensions).
- **Retrieval**: MongoDB Atlas Vector Search performs semantic lookup of relevant memories during chat initiation.
- **Identity Export**: A specialized workflow for synthesizing a portable user profile.

### 4. UI/UX Design System
- **Aesthetic**: Dark-mode primary, glassmorphism, Framer Motion animations.
- **Feature-Driven**: Separated Sidebar views (Chats vs. Media), interactive Settings Modal, and real-time streaming status indicators.

## 🧠 Key Decisions & Context

- **Persistence-First Strategy**: Messages are written to the database *before* service calls. This ensures a "Source of Truth" in the DB even if the AI stream fails.
- **Optimistic UI**: The frontend displays messages immediately upon submission, with a "streaming" state to manage transition.
- **Modular Sidebar**: The decision to separate "Media" and "Chats" into tabs allows for a cleaner navigation experience for multimedia-heavy users.
- **Hybrid Auth**: Using Clerk for robust user management while maintaining local MongoDB profiles for personalization and memory.

## 🚀 Future Roadmap (High Level)
- **Plugin System**: Allow for external tool calling (Function Calling).
- **Enhanced Personalization**: Granular control over "AI Tone" and "Expertise Level".
- **Multi-Modal Workflows**: Deeper integration of image generation (Flux) with chat context.
- **Agentic Automation**: Transitioning from a chatbot to an autonomous workspace assistant.
