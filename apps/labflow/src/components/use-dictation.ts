'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Speak instead of type, where the browser can do it (Chrome, Edge, Safari;
 * not Firefox). Where it cannot, `supported` stays false and no button is
 * shown, rather than a button that does nothing.
 *
 * The browser does the listening, not Labquill: Chrome and Edge send the
 * audio to their maker's speech service, Safari to Apple's. The panel says so
 * while it listens.
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscription = () => () => {};

export function useDictation(onText: (text: string) => void) {
  // False on the server and during hydration, then the browser's answer.
  const supported = useSyncExternalStore(
    noSubscription,
    () => recognitionClass() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const current = useRef<Recognition | null>(null);
  const latest = useRef(onText);
  useEffect(() => {
    latest.current = onText;
  });

  useEffect(() => () => current.current?.stop(), []);

  /** `before` is what is already in the box; speech is added after it. */
  function start(before: string) {
    const Class = recognitionClass();
    if (!Class || current.current) return;
    const recognition = new Class();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    const lead = before && !/\s$/.test(before) ? `${before} ` : before;
    recognition.onresult = (event) => {
      let heard = '';
      for (let i = 0; i < event.results.length; i++) heard += event.results[i]![0].transcript;
      latest.current(lead + heard.trimStart());
    };
    recognition.onerror = (event) => {
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'The microphone is blocked. Allow it from the icon in the address bar, then try again.'
          : event.error === 'no-speech'
            ? 'Nothing was heard. Try again, a little closer to the microphone.'
            : event.error === 'network'
              ? 'Speech needs an internet connection in this browser.'
              : '',
      );
    };
    recognition.onend = () => {
      current.current = null;
      setListening(false);
    };
    setError('');
    current.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      current.current = null;
    }
  }

  function stop() {
    current.current?.stop();
  }

  return { supported, listening, error, start, stop };
}
