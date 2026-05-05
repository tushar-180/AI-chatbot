import { User } from "../models/User.model";

export type SyncUserInput = {
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
};

export const userService = {
  async syncUser(data: SyncUserInput) {
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
  }
};
