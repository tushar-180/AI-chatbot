import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export interface Provider {
  id: string;
  name: string;
}

export const useAvailableProviders = (
  selectedProvider: string,
  onProviderChange: (value: string) => void
) => {
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([]);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await api.get("/ai/providers");
        setAvailableProviders(res.data.providers || []);
      } catch (err) {
        console.error("Error fetching providers", err);
      }
    };
    fetchProviders();
  }, []);

  // Default selection logic
  useEffect(() => {
    if (availableProviders.length > 0 && !availableProviders.find(p => p.id === selectedProvider)) {
      const defaultGemini = availableProviders.find(p => p.id.startsWith("gemini"));
      if (defaultGemini) {
        onProviderChange(defaultGemini.id);
      } else if (availableProviders[0]) {
        onProviderChange(availableProviders[0].id);
      }
    }
  }, [availableProviders, selectedProvider, onProviderChange]);

  const currentProvider = availableProviders.find(p => p.id === selectedProvider);

  return {
    availableProviders,
    currentProvider,
  };
};
