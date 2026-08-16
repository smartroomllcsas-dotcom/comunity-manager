'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

// SpeechRecognition types (not in standard TS lib)
interface SpeechRecognitionResult { transcript: string; isFinal: boolean; }
interface SpeechRecognitionEvent { results: ArrayLike<ArrayLike<SpeechRecognitionResult>>; resultIndex: number; }
interface SpeechRecognitionInstance {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: (e: SpeechRecognitionEvent) => void;
  onerror: (e: unknown) => void;
  onend: () => void;
  start: () => void; stop: () => void; abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export interface UseVoiceInputResult {
  supported: boolean;
  listening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  start: (opts?: { lang?: string }) => void;
  stop: () => void;
  reset: () => void;
}

export function useVoiceInput(): UseVoiceInputResult {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const Ctor = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setSupported(!!Ctor);
  }, []);

  const start = useCallback((opts?: { lang?: string }) => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { setError('Speech recognition not supported'); return; }
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = opts?.lang ?? 'es-ES';
    rec.onresult = (event) => {
      let interim = ''; let finalT = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i][0];
        if (res) {
          // event.results[i] is a SpeechRecognitionResultList — isFinal is on the list item
          if ((event.results[i] as unknown as { isFinal: boolean }).isFinal) finalT += res.transcript;
          else interim += res.transcript;
        }
      }
      if (interim) setInterimTranscript(interim);
      if (finalT) { setTranscript(prev => (prev + ' ' + finalT).trim()); setInterimTranscript(''); }
    };
    rec.onerror = (e: unknown) => {
      const err = e as { error?: string };
      setError(err?.error || 'speech error');
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try { rec.start(); setListening(true); setError(null); }
    catch (e: unknown) { setError((e as Error).message); }
    recognitionRef.current = rec;
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
    setListening(false);
  }, []);

  const reset = useCallback(() => { setTranscript(''); setInterimTranscript(''); setError(null); }, []);

  useEffect(() => () => { if (recognitionRef.current) try { recognitionRef.current.abort(); } catch {} }, []);

  return { supported, listening, transcript, interimTranscript, error, start, stop, reset };
}
