import { useState, useEffect } from "react";
import { api, API_ORIGIN } from "@/lib/api";
import { io, Socket } from "socket.io-client";

export interface Provider {
  id: string;
  name: string;
}

// Global cache variables to deduplicate parallel requests and cache resolved providers
let cachedProviders: Provider[] | null = null;
let providersPromise: Promise<Provider[]> | null = null;
let listeners: Array<(providers: Provider[]) => void> = [];
let globalConfigSocket: Socket | null = null;

if (typeof window !== "undefined" && !globalConfigSocket) {
  globalConfigSocket = io(API_ORIGIN, {
    transports: ["websocket", "polling"],
  });

  globalConfigSocket.on("config_updated", async () => {
    cachedProviders = null;
    providersPromise = null;
    try {
      providersPromise = api
        .get("/ai/providers")
        .then((res) => {
          const providers = res.data.providers || [];
          cachedProviders = providers;
          return providers;
        });
      const providers = await providersPromise;
      listeners.forEach((fn) => fn(providers));
    } catch (err) {
      console.error("Error refreshing providers on config update", err);
    }
  });
}

export const useAvailableProviders = (
  selectedProvider: string,
  onProviderChange: (value: string) => void,
) => {
  const [availableProviders, setAvailableProviders] = useState<Provider[]>(
    cachedProviders || [],
  );

  useEffect(() => {
    listeners.push(setAvailableProviders);
    return () => {
      listeners = listeners.filter((fn) => fn !== setAvailableProviders);
    };
  }, []);

  useEffect(() => {
    if (cachedProviders) {
      setAvailableProviders(cachedProviders);
      return;
    }

    const fetchProviders = async () => {
      if (!providersPromise) {
        providersPromise = api
          .get("/ai/providers")
          .then((res) => {
            const providers = res.data.providers || [];
            cachedProviders = providers;
            return providers;
          })
          .catch((err) => {
            providersPromise = null; // Reset on failure to allow future retries
            throw err;
          });
      }

      try {
        const providers = await providersPromise;
        if (providers) {
          setAvailableProviders(providers);
        }
      } catch (err) {
        console.error("Error fetching providers", err);
      }
    };

    fetchProviders();
  }, []);

  // Default selection logic
  useEffect(() => {
    if (
      availableProviders.length > 0 &&
      !availableProviders.find((p) => p.id === selectedProvider)
    ) {
      const defaultGemini = availableProviders.find((p) =>
        p.id.startsWith("gemini"),
      );
      if (defaultGemini) {
        onProviderChange(defaultGemini.id);
      } else if (availableProviders[0]) {
        onProviderChange(availableProviders[0].id);
      }
    }
  }, [availableProviders, selectedProvider, onProviderChange]);

  const currentProvider = availableProviders.find(
    (p) => p.id === selectedProvider,
  );

  return {
    availableProviders,
    currentProvider,
  };
};
