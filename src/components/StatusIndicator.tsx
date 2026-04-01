"use client";

import type { SessionState } from "@/lib/types";

const STATUS_CONFIG: Record<
  SessionState,
  { label: string; color: string; pulse: boolean }
> = {
  idle: { label: "Ready", color: "bg-slate-500", pulse: false },
  listening: { label: "Listening", color: "bg-emerald-500", pulse: true },
  interrupted: { label: "Coaching", color: "bg-amber-500", pulse: true },
  followUp: { label: "Follow-up", color: "bg-blue-500", pulse: false },
  summary: { label: "Summary", color: "bg-purple-500", pulse: false },
};

export function StatusIndicator({ state }: { state: SessionState }) {
  const config = STATUS_CONFIG[state];

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-3 w-3">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75 animate-ping`}
          />
        )}
        <span
          className={`relative inline-flex h-3 w-3 rounded-full ${config.color}`}
        />
      </div>
      <span className="text-sm font-medium text-slate-300">
        {config.label}
      </span>
    </div>
  );
}
