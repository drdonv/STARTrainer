"use client";

import { useEffect, useRef } from "react";

interface TranscriptDisplayProps {
  transcript: string;
  isSpeaking: boolean;
}

const FILLER_PATTERN =
  /\b(um+|uh+|like|you know|basically|actually|honestly|literally|i mean|kind of|sort of)\b/gi;

export function TranscriptDisplay({
  transcript,
  isSpeaking,
}: TranscriptDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcript]);

  if (!transcript) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <p className="text-sm text-slate-500">
          {isSpeaking
            ? "Processing speech..."
            : "Start speaking to see your transcript here..."}
        </p>
      </div>
    );
  }

  const highlighted = transcript.replace(FILLER_PATTERN, (match) => {
    return `<mark class="bg-amber-500/30 text-amber-300 rounded px-0.5">${match}</mark>`;
  });

  return (
    <div
      ref={containerRef}
      className="h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-6 scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700"
    >
      <p
        className="text-sm leading-relaxed text-slate-300"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      {isSpeaking && (
        <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-emerald-400" />
      )}
    </div>
  );
}
