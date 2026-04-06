"use client";

import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef } from "react";

interface TranscriptDisplayProps {
  transcript: string;
  isSpeaking: boolean;
}

const FILLER_PATTERN =
  /\b(um+|uh+|like|you know|basically|actually|honestly|literally|i mean|kind of|sort of)\b/gi;

function highlightedTranscriptNodes(transcript: string) {
  const parts = transcript.split(FILLER_PATTERN);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "") continue;
    if (i % 2 === 1) {
      nodes.push(
        <mark
          key={i}
          className="rounded bg-amber-500/30 px-0.5 text-amber-300"
        >
          {part}
        </mark>,
      );
    } else {
      nodes.push(<Fragment key={i}>{part}</Fragment>);
    }
  }
  return nodes;
}

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

  const highlightedNodes = useMemo(
    () => (transcript ? highlightedTranscriptNodes(transcript) : []),
    [transcript],
  );

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

  return (
    <div
      ref={containerRef}
      className="h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-6 scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700"
    >
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
        {highlightedNodes}
      </p>
      {isSpeaking && (
        <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-emerald-400" />
      )}
    </div>
  );
}
