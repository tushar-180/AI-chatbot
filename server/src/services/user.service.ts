import { User } from "../models/User.model";
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
  }
};
