import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { setAuthTokenGetter } from "../../../lib/api";

/**
 * Wires Clerk's getToken into the axios instance so every
 * request automatically carries a valid JWT in the Authorization header.
 *
 * The server handles user creation on first request via the requireAuth
 * middleware — no manual sync logic needed on the client.
 */
export const useAuthSetup = () => {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(getToken);
  }, [getToken]);
};
