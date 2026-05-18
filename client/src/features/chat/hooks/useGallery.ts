import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useUser } from "@clerk/react";

export interface GalleryItem {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
  messageId: string;
  chatId: string;
  createdAt: string;
}

export const useGallery = () => {
  const { user } = useUser();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGallery = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get("/chat/gallery");
      console.log("Gallery", res.data);
      setItems(res.data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch gallery", err);
      setError("Failed to load gallery");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchGallery();
    }
  }, [user?.id]);

  return { items, loading, error, refresh: fetchGallery };
};
