import { User } from "../models/User.model";
import { UserMemory } from "../models/UserMemory.model";
import { aiService } from "./ai.service";
import { Personalization, UserProfile } from "../types/chat.types";
import { EXPORT_DATA_PROMPT } from "../constants/prompt.constants";

export const userService = {
  async syncUser(data: Partial<UserProfile>) {
    const { clerkId, ...rest } = data;
    
    // Upsert user: update if exists, create if not
    const user = await User.findOneAndUpdate(
      { clerkId },
      { 
        clerkId, 
        ...rest, 
        lastSignInAt: new Date() 
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return user;
  },

  async getUserByClerkId(clerkId: string) {
    return await User.findOne({ clerkId });
  },

  async updatePersonalization(clerkId: string, data: Personalization) {
    return await User.findOneAndUpdate(
      { clerkId },
      { $set: { personalization: data } },
      { returnDocument: "after" }
    );
  },

  async getPersonalizationContext(clerkId: string) {
    const user = await this.getUserByClerkId(clerkId);
    if (!user || !user.personalization) return null;

    const { customInstructions, nickname, occupation, tone } = user.personalization;
    
    if (!customInstructions && !nickname && !occupation && tone === "Default") {
      return null;
    }

    let context = "USER PERSONALIZATION (ADAPT YOUR RESPONSE ACCORDINGLY):\n";
    if (nickname) context += `- Call the user: ${nickname}\n`;
    if (occupation) context += `- User's Occupation: ${occupation}\n`;
    if (tone && tone !== "Default") context += `- Response Tone: ${tone}\n`;
    if (customInstructions) context += `- Custom Instructions: ${customInstructions}\n`;

    return context;
  },

  async exportData(clerkId: string) {
    const user = await this.getUserByClerkId(clerkId);
    if (!user) throw new Error("User not found");

    const memories = await UserMemory.find({ userId: clerkId }).sort({ createdAt: -1 });
    
    // Construct context for the AI
    let context = `USER PROFILE:
- Name: ${`${user.firstName || ""} ${user.lastName || ""}`.trim() || "Not provided"}
- Nickname: ${user.personalization?.nickname || "Not provided"}
- Occupation: ${user.personalization?.occupation || "Not provided"}
- Preferred Tone: ${user.personalization?.tone || "Default"}
- Custom Instructions: ${user.personalization?.customInstructions || "None"}

STORED MEMORIES:
${memories.map(m => `- [${m.category}] ${m.content} (Recorded: ${m.createdAt.toISOString().split('T')[0]})`).join("\n")}
`;

    const exportPrompt = EXPORT_DATA_PROMPT(context);

    const provider = aiService.getProvider("gemini");
    provider.setModel("gemini-3.1-flash-lite-preview");
    
    const summary = await provider.generateResponse([
      { role: "user", content: exportPrompt, userId: clerkId }
    ]);

    return summary.text;
  }
};
