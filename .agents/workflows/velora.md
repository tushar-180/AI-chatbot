---
description: Comprehensive development guide for the Velora AI project.
---

# Velora AI: Development Workflow

Welcome to the Velora AI development environment. This workflow provides a high-level guide on how to interact with the codebase and maintain the quality of the project.

## 🛠️ Core Commands
- **Start Dev Servers**: Run `npm run dev` in both `client/` and `server/` directories.
- **Linting**: Run `npm run lint` to ensure code style consistency.
- **Build**: Run `npm run build` to verify production readiness.

## 🏗️ Architectural Overview
- **Frontend**: React + Vite + Tailwind + Zustand.
- **Backend**: Express + TypeScript + MongoDB + Cloudinary.
- **AI**: Adapter-based architecture with streaming (SSE).

## 📂 Key Directories
- `/client/src/features/chat`: Main chat UI and logic.
- `/server/src/services/ai`: AI provider adapters.
- `/server/src/models`: Database schemas.

## 🔄 Development Process
1. **Understand**: Check `.agent/memory.md` for architectural context.
2. **Plan**: Identify the feature or bug and update `.agent/tasks.md`.
3. **Execute**: Implement changes following the patterns in `CODE_FLOW.md`.
4. **Sync**: Update agent memory and knowledge files after major changes.

## 🆘 Troubleshooting
- If streaming fails, check `server/src/controllers/ai.controller.ts`.
- If memory is incorrect, verify the `UserMemory` collection in MongoDB.
