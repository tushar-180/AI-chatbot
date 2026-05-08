import { toast } from "sonner";

export const requestMicPermission = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("🎤 Microphone permission granted");
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (err: any) {
    console.error("❌ Microphone issue:", err);

    if (err.name === "NotFoundError") {
      toast.error("No microphone detected");
    } else if (err.name === "NotAllowedError") {
      toast.error("Microphone permission denied");
    } else {
      toast.error("Unable to access microphone");
    }

    return false;
  }
};