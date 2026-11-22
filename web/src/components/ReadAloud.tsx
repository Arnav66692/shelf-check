"use client";

import { useEffect, useState } from "react";

export function ReadAloud({ lines }: { lines: readonly string[] }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (lines.length === 0) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(lines.join(" "));
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  }

  return (
    <button type="button" className="underline font-bold" onClick={toggle} aria-pressed={speaking}>
      {speaking ? "Stop reading" : "Read aloud"}
    </button>
  );
}
