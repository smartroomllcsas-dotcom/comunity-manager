'use client';
import { useCallback, useEffect, useState } from 'react';

export function useTextToSpeech() {
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported(typeof window !== 'undefined' && !!window.speechSynthesis); }, []);
  const speak = useCallback((text: string, opts?: { lang?: string; rate?: number }) => {
    if (!supported) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = opts?.lang ?? 'es-ES';
    utter.rate = opts?.rate ?? 1.0;
    window.speechSynthesis.speak(utter);
  }, [supported]);
  const stop = useCallback(() => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  return { supported, speak, stop };
}
