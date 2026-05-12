import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { api } from "../../../lib/api";

/**
 * Hook to synchronize Clerk user data with the local MongoDB database.
 * Calls the /api/user/sync endpoint whenever the user signs in.
 */
export const useUserSync = () => {
  const { user, isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    const syncUser = async () => {
      if (isLoaded && isSignedIn && user) {
        try {
          const response = await api.post("/user/sync", {
            clerkId: user.id,
            email: user.primaryEmailAddress?.emailAddress,
            firstName: user.firstName,
            lastName: user.lastName,
            imageUrl: user.imageUrl,
          });

          if (response.status !== 200) {
            console.error("Failed to sync user with database");
          }
        } catch (error) {
          console.error("Error syncing user:", error);
        }
      }
    };

    syncUser();
  }, [isLoaded, isSignedIn, user]);
};
