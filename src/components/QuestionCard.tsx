"use client";

import type { InterviewQuestion } from "@/lib/types";

interface QuestionCardProps {
  question: InterviewQuestion | null;
  followUpQuestion?: string | null;
}

export function QuestionCard({ question, followUpQuestion }: QuestionCardProps) {
  const displayText = followUpQuestion || question?.text;

  if (!displayText) return null;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 p-6 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {followUpQuestion ? "Follow-up" : question?.category === "technical" ? "Technical" : "Behavioral"}
        </span>
      </div>
      <p className="text-lg font-medium leading-relaxed text-slate-100">
        &ldquo;{displayText}&rdquo;
      </p>
    </div>
  );
}
