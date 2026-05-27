import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import axios from "axios";
import { API_ORIGIN } from "../lib/api";

interface ServerStatusContextType {
  isDown: boolean;
  isRetrying: boolean;
  retry: () => Promise<void>;
  setDown: (down: boolean) => void;
  onClose: () => void;
}

const ServerStatusContext = createContext<ServerStatusContextType | undefined>(
  undefined,
);

export const ServerStatusProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isDown, setIsDown] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const [isDismissed, setIsDismissed] = useState(false);

  const isDownRef = useRef(isDown);
  useEffect(() => {
    isDownRef.current = isDown;
  }, [isDown]);

  const checkStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_ORIGIN}/health?t=${Date.now()}`, {
        timeout: 5000,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
      if (res.status !== 200 || !res.data || res.data.ok !== true) {
        throw new Error("Invalid health check response");
      }
      setIsDown(false);
      setIsDismissed(false); // Reset dismissal when server is back
      window.dispatchEvent(new CustomEvent("server-up"));
    } catch (error) {
      setIsDown(true);
      setIsDismissed(false);
      window.dispatchEvent(new CustomEvent("server-down"));
    }
  }, []);

  // Register event listeners and check server status on mount
  useEffect(() => {
    // Proactively check if the server is up/down on page reload
    checkStatus();

    const handleServerDown = () => {
      setIsDown(true);
      setIsDismissed(false);
    };

    const handleServerUp = () => {
      if (isDownRef.current) {
        window.location.reload();
        return;
      }
      setIsDown(false);
      setIsDismissed(false);
    };

    window.addEventListener("server-down", handleServerDown);
    window.addEventListener("server-up", handleServerUp);

    return () => {
      window.removeEventListener("server-down", handleServerDown);
      window.removeEventListener("server-up", handleServerUp);
    };
  }, [checkStatus]); // Empty deps: only register once

  // Poll the health endpoint every 10s while the server is down
  useEffect(() => {
    if (!isDown) return;
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [isDown, checkStatus]);

  const retry = async () => {
    setIsRetrying(true);
    try {
      const res = await axios.get(`${API_ORIGIN}/health?t=${Date.now()}`, {
        timeout: 5000,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
      if (res.status !== 200 || !res.data || res.data.ok !== true) {
        throw new Error("Invalid health check response");
      }
      setIsDown(false);
      setIsDismissed(false);
      window.dispatchEvent(new CustomEvent("server-up"));
    } catch (error) {
      setIsDown(true);
      setIsDismissed(false);
      window.dispatchEvent(new CustomEvent("server-down"));
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <ServerStatusContext.Provider
      value={{
        isDown: isDown && !isDismissed,
        isRetrying,
        retry,
        setDown: (down) => {
          setIsDown(down);
          setIsDismissed(false);
          window.dispatchEvent(new CustomEvent(down ? "server-down" : "server-up"));
        },
        onClose: () => setIsDismissed(true),
      }}
    >
      {children}
    </ServerStatusContext.Provider>
  );
};

export const useServerStatus = () => {
  const context = useContext(ServerStatusContext);
  if (context === undefined) {
    throw new Error(
      "useServerStatus must be used within a ServerStatusProvider",
    );
  }
  return context;
};
