"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryService = void 0;
const UserMemory_model_1 = require("../models/UserMemory.model");
const ai_service_1 = require("./ai.service");
const prompt_constants_1 = require("../constants/prompt.constants");
exports.memoryService = {
    /**
     * Fetch all memories for a specific user
     */
    getMemories(userId_1) {
        return __awaiter(this, arguments, void 0, function* (userId, limit = 50, skip = 0) {
            const memories = yield UserMemory_model_1.UserMemory.find({ userId })
                .sort({ importance: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit);
            // Trigger background repair for any empty embeddings
            this.repairMissingEmbeddings(userId).catch(console.error);
            return memories;
        });
    },
    /**
     * Fetch relevant memories using Vector Search (RAG)
     */
    getMemoryContext(userId, currentMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            const provider = ai_service_1.aiService.getProvider();
            // 1. Fetch "Personal" memories regardless of vector search (identity is always relevant)
            const personalMemories = yield UserMemory_model_1.UserMemory.find({
                userId,
                category: "personal"
            }).limit(5).lean();
            let relevantMemories = [];
            // 2. Perform Vector Search if there is a current message
            if (currentMessage) {
                try {
                    // Use Gemini specifically for embeddings (reliable & configured)
                    const embeddingProvider = ai_service_1.aiService.getProvider("gemini");
                    const queryVector = yield embeddingProvider.generateEmbedding(currentMessage);
                    if (queryVector && queryVector.length > 0) {
                        // MongoDB Atlas Vector Search Aggregation with Importance Boosting
                        relevantMemories = yield UserMemory_model_1.UserMemory.aggregate([
                            {
                                $vectorSearch: {
                                    index: "vector_index",
                                    path: "embedding",
                                    queryVector: queryVector,
                                    numCandidates: 100,
                                    limit: 20, // Fetch more to allow for importance re-ranking
                                    filter: { userId: userId }
                                }
                            },
                            {
                                $addFields: {
                                    vectorScore: { $meta: "vectorSearchScore" }
                                }
                            },
                            {
                                $addFields: {
                                    // FinalScore = Similarity * Importance
                                    // Importance is 1-5, so we normalize it slightly
                                    finalScore: { $multiply: ["$vectorScore", "$importance"] }
                                }
                            },
                            { $sort: { finalScore: -1 } },
                            { $limit: 10 }
                        ]);
                    }
                }
                catch (error) {
                    console.error("Vector search failed, falling back to recency:", error);
                }
            }
            // 3. Fallback to recency if no vector results
            if (relevantMemories.length === 0) {
                relevantMemories = yield UserMemory_model_1.UserMemory.find({ userId })
                    .sort({ updatedAt: -1 })
                    .limit(5)
                    .lean();
            }
            // 4. Combine, Deduplicate and Limit by Size (Token Control)
            const combined = [...personalMemories, ...relevantMemories];
            const uniqueIds = new Set();
            const uniqueMemories = combined.filter(m => {
                if (uniqueIds.has(String(m._id)))
                    return false;
                uniqueIds.add(String(m._id));
                return true;
            });
            if (uniqueMemories.length === 0)
                return "";
            // Token/Size Control: Build the string until we hit a character limit
            let facts = "";
            const MAX_CHARS = 2500; // Roughly 600-800 tokens
            for (const m of uniqueMemories) {
                const factLine = `- ${m.content}\n`;
                if ((facts + factLine).length > MAX_CHARS)
                    break;
                facts += factLine;
            }
            return (0, prompt_constants_1.MEMORY_CONTEXT_PROMPT)(facts);
        });
    },
    /**
     * Save a new memory snippet with embeddings
     */
    addMemory(userId_1, content_1) {
        return __awaiter(this, arguments, void 0, function* (userId, content, category = "general") {
            // Deduplication
            const existing = yield UserMemory_model_1.UserMemory.findOne({ userId, content });
            if (existing)
                return existing;
            // Generate Embedding for RAG (Always use Gemini for consistency)
            const embeddingProvider = ai_service_1.aiService.getProvider("gemini");
            const embedding = yield embeddingProvider.generateEmbedding(content);
            return yield UserMemory_model_1.UserMemory.create({
                userId,
                content,
                category,
                embedding
            });
        });
    },
    /**
     * Analyze a message and extract new memories using AI
     */
    extractMemoriesFromMessage(userId, userMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const provider = ai_service_1.aiService.getProvider(); // Use default provider
                const extractionPrompt = (0, prompt_constants_1.MEMORY_EXTRACTION_PROMPT)(userMessage);
                const response = yield provider.generateResponse([
                    { role: "user", content: extractionPrompt, userId }
                ]);
                const cleanedResponse = response.trim();
                if (cleanedResponse === "NONE" || !cleanedResponse)
                    return [];
                const lines = cleanedResponse.split("\n").filter(Boolean);
                // Parallel Memory Extraction/Saving for speed
                const savedMemories = yield Promise.all(lines.map((line) => __awaiter(this, void 0, void 0, function* () {
                    const [fact, category] = line.split("|").map(s => s.trim());
                    if (fact) {
                        return yield this.addMemory(userId, fact, category || "general");
                    }
                    return null;
                })));
                return savedMemories.filter(Boolean);
            }
            catch (error) {
                console.error("Memory extraction failed:", error);
                return [];
            }
        });
    },
    /**
     * Background task to fill in missing embeddings for a user's memories
     */
    repairMissingEmbeddings(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const incompleteMemories = yield UserMemory_model_1.UserMemory.find({
                userId,
                $or: [
                    { embedding: { $exists: false } },
                    { embedding: { $size: 0 } },
                    { embedding: { $size: 3072 } } // Repair old 3072-dim embeddings
                ]
            });
            if (incompleteMemories.length === 0)
                return;
            console.log(`[MemoryService] Repairing ${incompleteMemories.length} missing embeddings for user ${userId}...`);
            const embeddingProvider = ai_service_1.aiService.getProvider("gemini");
            for (const memory of incompleteMemories) {
                try {
                    const embedding = yield embeddingProvider.generateEmbedding(memory.content);
                    if (embedding && embedding.length > 0) {
                        yield UserMemory_model_1.UserMemory.updateOne({ _id: memory._id }, { $set: { embedding } });
                    }
                }
                catch (err) {
                    console.error(`Failed to repair embedding for memory ${memory._id}:`, err);
                }
            }
            console.log(`[MemoryService] Repair completed for user ${userId}.`);
        });
    }
};
