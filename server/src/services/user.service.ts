import { User } from "../models/User.model";
import { UserMemory } from "../models/UserMemory.model";
import { aiService } from "./ai.service";
import { Personalization, UserProfile } from "../types/chat.types";

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

    const exportPrompt = `You are helping me import context from one AI assistant to another. Your job is to go through our past conversations and sum up what you know about me.

In the output, please avoid using any first-person pronouns (I, my, me, mine) and any second-person pronouns (you, your, yours). Instead, refer to the individual you have learned about as "the user" or use neutral phrasing.

Preserve the user's words verbatim where possible, especially for instructions and preferences.

Categories (output in this order):
1. Demographics Information: Preferred names, profession, education, and general residence.
2. Interests & Preferences: Sustained, active engagements (not just owning an object or a one-time purchase).
3. Relationships: Confirmed, sustained relationships.
4. Dated Events, Projects & Plans: A log of significant, recent activities.
5. Instructions: Rules I've explicitly asked you to follow going forward, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

Format:
Divide the content into the labeled section using the categories above. Try to include verbatim quotes from my prompts that justify each entry. Structure each entry using this format:
* The user's name is <name>.
    * Evidence: User said "call me <name>". Date: [YYYY-MM-DD].

Output:
- Format the final output summary as a text block.

Finally, complete the sentence "My AI name is: <name>", where name is ChatGPT, Claude, Grok, etc.

CONTEXT TO PROCESS:
${context}
`;

    const provider = aiService.getProvider("gemini");
    provider.setModel("gemini-3.1-flash-lite-preview");
    
    const summary = await provider.generateResponse([
      { role: "user", content: exportPrompt, userId: clerkId }
    ]);

    return summary;
  }
};
