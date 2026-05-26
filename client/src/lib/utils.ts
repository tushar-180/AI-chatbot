import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function optimizeImageUrl(url: string | null | undefined, width: number = 100, height?: number): string {
  if (!url) return "";
  
  // 1. Clerk Images
  if (url.includes("img.clerk.com")) {
    try {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.set("width", width.toString());
      if (height) {
        parsedUrl.searchParams.set("height", height.toString());
        parsedUrl.searchParams.set("fit", "crop");
      } else {
        parsedUrl.searchParams.set("height", width.toString());
        parsedUrl.searchParams.set("fit", "crop");
      }
      parsedUrl.searchParams.set("quality", "80");
      return parsedUrl.toString();
    } catch (e) {
      return url;
    }
  }
  
  // 2. Cloudinary Images
  if (url.includes("res.cloudinary.com")) {
    const uploadIndex = url.indexOf("/upload/");
    if (uploadIndex !== -1) {
      const beforeUpload = url.slice(0, uploadIndex + 8); // includes '/upload/'
      const afterUpload = url.slice(uploadIndex + 8);
      if (height) {
        // Explicit height: crop to exact dimensions (avatars, thumbnails)
        const transformParams = `f_auto,q_auto,w_${width},h_${height},c_fill/`;
        return `${beforeUpload}${transformParams}${afterUpload}`;
      } else {
        // Width only: scale down preserving aspect ratio (attachments, full images)
        const transformParams = `f_auto,q_auto,w_${width},c_limit/`;
        return `${beforeUpload}${transformParams}${afterUpload}`;
      }
    }
  }
  
  return url;
}
