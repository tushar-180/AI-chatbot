import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import {API_ORIGIN } from "../lib/api";

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
      await axios.get(`${API_ORIGIN}/health`, { timeout: 5000 });
      setIsDown(false);
      setIsDismissed(false); // Reset dismissal when server is back
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (!error.response || error.code === "ECONNABORTED" || error.response.status >= 500)
      ) {
        setIsDown(true);
      }
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (isDown) {
      interval = setInterval(checkStatus, 10000); // Poll every 10s when down
    }

    const handleServerDown = () => {
      setIsDown(true);
      setIsDismissed(false);
    };

    window.addEventListener("server-down", handleServerDown);

    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener("server-down", handleServerDown);
    };
  }, [isDown, checkStatus]);

  const retry = async () => {
    setIsRetrying(true);
    try {
      await axios.get(`${API_ORIGIN}/health`, { timeout: 5000 });
      setIsDown(false);
      setIsDismissed(false);
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
