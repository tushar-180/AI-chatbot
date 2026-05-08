import { checkProfanity } from "glin-profanity";
import { toast } from "sonner";

export const VerifyVoiceProfanity = (text: string) => {
  const result = checkProfanity(text);

  console.log("🧪 Profanity result:", result);

  let cleanedText = text;

  if (result.containsProfanity) {
    toast.warning("⚠️ Some words were censored");

    result.profaneWords.forEach((word: string) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");

      cleanedText = cleanedText.replace(regex, "*".repeat(word.length));
    });
  }
    return cleanedText;
};
