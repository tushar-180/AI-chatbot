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
  const silenceTimerRef = useRef<any | null>(null);
  const restartTimerRef = useRef<any | null>(null);
  const inactivityStoppedRef = useRef(false);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Voice recognition is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();

    // 🔥 IMPORTANT CHANGE: keep alive session
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    const clearSilenceTimer = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };

    const startSilenceTimer = () => {
      clearSilenceTimer();

      silenceTimerRef.current = setTimeout(() => {
        console.log("⏰ 30s inactivity - stopping recognition");

        inactivityStoppedRef.current = true;

        try {
          recognition.stop();
        } catch (err) {
          console.error("Error stopping recognition:", err);
        }

        toast.error("Stopped due to inactivity");
      }, 7000);
    };

    recognition.onstart = () => {
      setIsListening(true);
      startSilenceTimer();

      toastIdRef.current = toast.loading("🎤 Listening...");
    };

    recognition.onend = () => {
      setIsSpeaking(false);
      clearSilenceTimer();

      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }

      if (manuallyStoppedRef.current || inactivityStoppedRef.current) {
        setIsListening(false);

        inactivityStoppedRef.current = false;

        return;
      }

      // 🔥 auto-restart (Chrome random stop fix)
      if (!manuallyStoppedRef.current && !inactivityStoppedRef.current) {
        restartTimerRef.current = setTimeout(() => {
          try {
            recognition.start();
          } catch {}
        }, 1000);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      startSilenceTimer();

      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");

      const lastResult = event.results[event.results.length - 1];

      if (lastResult.isFinal) {
        const cleaned = VerifyVoiceProfanity(transcript);
        onResult(cleaned);
      }
    };

    recognition.onsoundstart = () => {
      startSilenceTimer();
    };

    recognition.onspeechstart = () => {
      setIsSpeaking(true);
      startSilenceTimer();

      if (toastIdRef.current) {
        toast.loading("🗣️ Speech Detected...", {
          id: toastIdRef.current,
        });
      }
    };

    recognition.onspeechend = () => {
      setIsSpeaking(false);
      startSilenceTimer();

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

    return () => {
      clearSilenceTimer();

      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }

      try {
        recognition.stop();
      } catch {}
    };
  }, [onResult]);

  const start = async () => {
    if (isListening) return;

    manuallyStoppedRef.current = false;
    inactivityStoppedRef.current = false;

    const ok = await requestMicPermission();
    if (!ok) return;

    try {
      recognitionRef.current?.start();
    } catch {
      console.log("Already started");
    }
  };

  const stop = () => {
    manuallyStoppedRef.current = true;

    setIsListening(false);
    setIsSpeaking(false);

    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }

    try {
      recognitionRef.current?.stop();
    } catch {}
  };

  return {
    isListening,
    isSpeaking,
    start,
    stop,
  };
};
