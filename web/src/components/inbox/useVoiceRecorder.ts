"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type VoiceRecorderOptions = {
  disabled: boolean;
  onStart?: () => void;
  onAudioRecorded: (blob: Blob, mimeType: string) => Promise<void> | void;
  onError: (message: string) => void;
};

export function useVoiceRecorder({ disabled, onStart, onAudioRecorded, onError }: VoiceRecorderOptions) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const start = useCallback(async () => {
    if (disabled || recording) return;
    onStart?.();

    if (!navigator.mediaDevices?.getUserMedia) {
      onError("Tu navegador no soporta grabación de audio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      setSeconds(0);
      setRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const chunks = chunksRef.current.slice();
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (!chunks.length) return;
        try {
          const blob = new Blob(chunks, { type: mimeType });
          await onAudioRecorded(blob, mimeType);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "No se pudo subir el audio grabado.";
          onError(msg);
        }
      };

      recorder.start();
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => current + 1);
      }, 1000);
    } catch (error) {
      console.error(error);
      onError("No se pudo acceder al micrófono.");
      setRecording(false);
      streamRef.current = null;
      recorderRef.current = null;
    }
  }, [disabled, recording, onStart, onAudioRecorded, onError]);

  const stop = useCallback(() => {
    if (!recording) return;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
  }, [recording]);

  const toggle = useCallback(() => {
    if (recording) {
      stop();
      return;
    }
    void start();
  }, [recording, stop, start]);

  return { recording, seconds, start, stop, toggle };
}
