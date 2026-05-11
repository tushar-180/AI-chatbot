import { UserMemory } from "../models/UserMemory.model";
import { aiService } from "./ai.service";
import { MEMORY_CONTEXT_PROMPT,  MEMORY_EXTRACTION_PROMPT } from "../constants/prompt.constants";

export const memoryService = {
  /**
   * Fetch all memories for a specific user
   */
  async getMemories(userId: string, limit: number = 50, skip: number = 0) {
    const memories = await UserMemory.find({ userId })
      .sort({ importance: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Trigger background repair for any empty embeddings
    this.repairMissingEmbeddings(userId).catch(console.error);
    return memories;
  },

  /**
   * Fetch relevant memories using Vector Search (RAG)
   */
  async getMemoryContext(userId: string, currentMessage?: string): Promise<string> {
    const provider = aiService.getProvider();
    
    // 1. Fetch "Personal" memories regardless of vector search (identity is always relevant)
    const personalMemories = await UserMemory.find({ 
      userId, 
      category: "personal" 
    }).limit(5).lean();

    let relevantMemories: any[] = [];

    // 2. Perform Vector Search if there is a current message
    if (currentMessage) {
      try {
        // Use Gemini specifically for embeddings (reliable & configured)
        const embeddingProvider = aiService.getProvider("gemini");
        const queryVector = await embeddingProvider.generateEmbedding(currentMessage);
        
        if (queryVector && queryVector.length > 0) {
          // MongoDB Atlas Vector Search Aggregation with Importance Boosting
          relevantMemories = await UserMemory.aggregate([
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
      } catch (error) {
        console.error("Vector search failed, falling back to recency:", error);
      }
    }

    // 3. Fallback to recency if no vector results
    if (relevantMemories.length === 0) {
      relevantMemories = await UserMemory.find({ userId })
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean();
    }

    // 4. Combine, Deduplicate and Limit by Size (Token Control)
    const combined = [...personalMemories, ...relevantMemories];
    const uniqueIds = new Set();
    const uniqueMemories = combined.filter(m => {
      if (uniqueIds.has(String(m._id))) return false;
      uniqueIds.add(String(m._id));
      return true;
    });

    if (uniqueMemories.length === 0) return "";

    // Token/Size Control: Build the string until we hit a character limit
    let facts = "";
    const MAX_CHARS = 2500; // Roughly 600-800 tokens

    for (const m of uniqueMemories) {
      const factLine = `- ${m.content}\n`;
      if ((facts + factLine).length > MAX_CHARS) break;
      facts += factLine;
    }
    return MEMORY_CONTEXT_PROMPT(facts);
  },

  /**
   * Save a new memory snippet with embeddings
   */
  async addMemory(userId: string, content: string, category: string = "general") {
    // Deduplication
    const existing = await UserMemory.findOne({ userId, content });
    if (existing) return existing;

    // Generate Embedding for RAG (Always use Gemini for consistency)
    const embeddingProvider = aiService.getProvider("gemini");
    const embedding = await embeddingProvider.generateEmbedding(content);

    return await UserMemory.create({ 
      userId, 
      content, 
      category,
      embedding 
    });
  },

  /**
   * Analyze a message and extract new memories using AI
   */
  async extractMemoriesFromMessage(userId: string, userMessage: string) {
    try {
      const provider = aiService.getProvider(); // Use default provider
      
      const extractionPrompt = MEMORY_EXTRACTION_PROMPT(userMessage);

      const response = await provider.generateResponse([
        { role: "user", content: extractionPrompt, userId }
      ]);

      const cleanedResponse = response.trim();
      if (cleanedResponse === "NONE" || !cleanedResponse) return [];

      const lines = cleanedResponse.split("\n").filter(Boolean);
      
      // Parallel Memory Extraction/Saving for speed
      const savedMemories = await Promise.all(
        lines.map(async (line) => {
          const [fact, category] = line.split("|").map(s => s.trim());
          if (fact) {
            return await this.addMemory(userId, fact, category as any || "general");
          }
          return null;
        })
      );

      return savedMemories.filter(Boolean);
    } catch (error) {
      console.error("Memory extraction failed:", error);
      return [];
    }
  },

  /**
   * Background task to fill in missing embeddings for a user's memories
   */
  async repairMissingEmbeddings(userId: string) {
    const incompleteMemories = await UserMemory.find({ 
      userId, 
      $or: [
        { embedding: { $exists: false } }, 
        { embedding: { $size: 0 } },
        { embedding: { $size: 3072 } } // Repair old 3072-dim embeddings
      ] 
    });

    if (incompleteMemories.length === 0) return;

    console.log(`[MemoryService] Repairing ${incompleteMemories.length} missing embeddings for user ${userId}...`);
    const embeddingProvider = aiService.getProvider("gemini");

    for (const memory of incompleteMemories) {
      try {
        const embedding = await embeddingProvider.generateEmbedding(memory.content);
        if (embedding && embedding.length > 0) {
          await UserMemory.updateOne({ _id: memory._id }, { $set: { embedding } });
        }
      } catch (err) {
        console.error(`Failed to repair embedding for memory ${memory._id}:`, err);
      }
    }
    console.log(`[MemoryService] Repair completed for user ${userId}.`);
  }
};
