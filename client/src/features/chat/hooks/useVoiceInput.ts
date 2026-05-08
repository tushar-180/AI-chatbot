import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { requestMicPermission } from "../services/voiceInput/voiceRequestMicPermission.service";
import { handleVoiceRecognitionError } from "../services/voiceInput/voiceError.service";
import { VerifyVoiceProfanity } from "../services/voiceInput/voiceProfanity";

type VoiceOptions = {
  onResult: (text: string) => void;
};

export const useVoiceInput = ({ onResult }: VoiceOptions) => {
  const recognitionRef = useRef<any | null>(null);
  const toastIdRef = useRef<string | number | null>(null);
  const manuallyStoppedRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // console.warn("SpeechRecognition not supported in this browser");
      toast.error("Voice recognition is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";


    recognition.onstart = () => {
      // console.log("🎤 Voice recognition started");
      setIsListening(true);
      toastIdRef.current = toast.loading("🎤 Listening...");
    };


    recognition.onend = () => {
      // console.log("🛑 Voice recognition stopped");
      setIsListening(false);
      setIsSpeaking(false);
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
    };


    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      // console.log("🧠 Voice transcript:", transcript);

      if (event.results[0].isFinal) {
        const cleanedText = VerifyVoiceProfanity(transcript);
        // console.log("🧹 Cleaned transcript:", cleanedText);
        onResult(cleanedText);
      }
    };


    recognition.onsoundstart = () => {
       console.log("🔊 Sound detected");
    };


    recognition.onspeechstart = () => {
      // console.log("🗣️ Speech started");
      setIsSpeaking(true);
      if (toastIdRef.current) {
        toast.loading("🗣️ Speech detected", {
          id: toastIdRef.current,
        });
      }
    };


    recognition.onspeechend = () => {
      // console.log("🛑 Speech ended");
      setIsSpeaking(false);
      if (toastIdRef.current) {
        toast.loading("🎤 Listening...", {
          id: toastIdRef.current,
        });
      }
    };


    recognition.onerror = (err: SpeechRecognitionErrorEvent) => {
      handleVoiceRecognitionError(err, manuallyStoppedRef.current);
    };


    recognitionRef.current = recognition;

  }, [onResult]);


  const start = async () => {
    // Prevent duplicate starts
    if (isListening) {
      console.log("⚠️ Already listening");
      return;
    }

    manuallyStoppedRef.current = false;

    const ok = await requestMicPermission();

    if (!ok) {
      console.log("🚫 Mic permission denied");
      return;
    }

    try {
      console.log("▶️ Starting speech recognition...");

      // Safety stop before restart
      recognitionRef.current?.stop();

      // Small delay helps Chrome reset internals
      setTimeout(() => {
        recognitionRef.current?.start();
      }, 150);
    } catch (err) {
      console.error("❌ Failed to start recognition:", err);
      toast.error("Unable to start voice recognition");
    }
  };

  
  const stop = () => {
    console.log("⛔ Stopping voice input...");

    manuallyStoppedRef.current = true;

    setIsListening(false);
    setIsSpeaking(false);

    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
    try {
      recognitionRef.current?.stop();
    } catch (err) {
      console.log("⚠️ Recognition already stopped");
    }
  };

  return {
    isListening,
    isSpeaking,
    start,
    stop,
  };
};
