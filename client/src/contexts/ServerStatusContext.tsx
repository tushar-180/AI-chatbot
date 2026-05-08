import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../lib/api";

interface ServerStatusContextType {
  isDown: boolean;
  isRetrying: boolean;
  retry: () => Promise<void>;
  setDown: (down: boolean) => void;
  onClose: () => void;
}

const ServerStatusContext = createContext<ServerStatusContextType | undefined>(undefined);

export const ServerStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDown, setIsDown] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const [isDismissed, setIsDismissed] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const origin = API_BASE_URL.replace(/\/api$/, "");
      await axios.get(origin, { timeout: 5000 });
      setIsDown(false);
      setIsDismissed(false); // Reset dismissal when server is back
    } catch (error) {
      if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) {
        setIsDown(true);
      }
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);

    const handleServerDown = () => {
      setIsDown(true);
      setIsDismissed(false);
    };
    window.addEventListener("server-down", handleServerDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener("server-down", handleServerDown);
    };
  }, [checkStatus]);

  const retry = async () => {
    setIsRetrying(true);
    try {
      const origin = API_BASE_URL.replace(/\/api$/, "");
      await axios.get(origin, { timeout: 5000 });
      setIsDown(false);
      setIsDismissed(false);
      window.location.reload(); // Reload on success
    } catch (error) {
      // Still down
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
        setDown: (down) => { setIsDown(down); setIsDismissed(false); },
        onClose: () => setIsDismissed(true)
      }}
    >
      {children}
    </ServerStatusContext.Provider>
  );
};

export const useServerStatus = () => {
  const context = useContext(ServerStatusContext);
  if (context === undefined) {
    throw new Error("useServerStatus must be used within a ServerStatusProvider");
  }
  return context;
};
