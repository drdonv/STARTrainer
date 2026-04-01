"use client";

import type { FeedbackType } from "@/lib/types";

interface CoachingAlertProps {
  message: string;
  type: FeedbackType;
}

const TYPE_CONFIG: Record<FeedbackType, { icon: string; accent: string }> = {
  filler: { icon: "🗣", accent: "border-amber-500 bg-amber-500/10" },
  star: { icon: "⚡", accent: "border-blue-500 bg-blue-500/10" },
  conciseness: { icon: "✂️", accent: "border-orange-500 bg-orange-500/10" },
  content: { icon: "🎯", accent: "border-red-500 bg-red-500/10" },
};

export function CoachingAlert({ message, type }: CoachingAlertProps) {
  const config = TYPE_CONFIG[type];

  return (
    <div
      className={`fixed left-1/2 top-6 z-50 w-full max-w-xl -translate-x-1/2 animate-[slide-down_0.3s_ease-out]`}
    >
      <div
        className={`rounded-xl border-2 ${config.accent} px-6 py-4 shadow-2xl shadow-black/50 backdrop-blur-md`}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl">{config.icon}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Coach Interruption
            </p>
            <p className="mt-1 text-lg font-bold text-white">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
