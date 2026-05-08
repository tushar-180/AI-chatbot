import { toast } from "sonner";

export const handleVoiceRecognitionError = (
  err: SpeechRecognitionErrorEvent,
  manuallyStopped: boolean
) => {
  console.error("❌ Speech recognition error:", err);

  // Ignore errors after manual stop
  if (manuallyStopped) {
    console.log("⛔ Ignoring error after manual stop");
    return;
  }

  // Ignore harmless browser interruptions
  if (
    err.error === "aborted" ||
    err.error === "network"
  ) {
    console.log("⚠️ Ignored browser interruption");
    return;
  }

  switch (err.error) {
    case "no-speech":
      toast.error("No speech detected");
      break;

    case "audio-capture":
      toast.error("Microphone not available");
      break;

    case "not-allowed":
      toast.error("Microphone permission denied");
      break;

    case "service-not-allowed":
      toast.error("Speech service not allowed");
      break;

    case "language-not-supported":
      toast.error("Language not supported");
      break;

    default:
      toast.error("Voice recognition failed");
  }
};