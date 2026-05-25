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
      const hParam = height ? `,h_${height}` : `,h_${width}`;
      const transformParams = `f_auto,q_auto,w_${width}${hParam},c_fill/`;
      return `${beforeUpload}${transformParams}${afterUpload}`;
    }
  }
  
  return url;
}
