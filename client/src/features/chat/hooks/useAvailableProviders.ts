import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export interface Provider {
  id: string;
  name: string;
}

// Global cache variables to deduplicate parallel requests and cache resolved providers
let cachedProviders: Provider[] | null = null;
let providersPromise: Promise<Provider[]> | null = null;

export const useAvailableProviders = (
  selectedProvider: string,
  onProviderChange: (value: string) => void,
) => {
  const [availableProviders, setAvailableProviders] = useState<Provider[]>(cachedProviders || []);

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

