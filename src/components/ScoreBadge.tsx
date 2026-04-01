"use client";

import type { StarProgress, StarSegmentSeconds } from "@/lib/types";

interface ScoreBadgeProps {
  score: number;
  starProgress: StarProgress;
  starPacing?: StarSegmentSeconds | null;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function getScoreRingColor(score: number): string {
  if (score >= 70) return "stroke-emerald-400";
  if (score >= 40) return "stroke-amber-400";
  return "stroke-red-400";
}

function formatPacingSeconds(s: number): string {
  return `${Math.round(s)}s`;
}

export function ScoreBadge({ score, starProgress, starPacing }: ScoreBadgeProps) {
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (score / 100) * circumference;

  const starParts: { key: keyof StarProgress; label: string }[] = [
    { key: "S", label: "Situation" },
    { key: "T", label: "Task" },
    { key: "A", label: "Action" },
    { key: "R", label: "Result" },
  ];

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Score circle */}
      <div className="relative h-28 w-28">
        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-slate-800"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={`${getScoreRingColor(score)} transition-all duration-700 ease-out`}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
            {score}
          </span>
          <span className="text-[10px] text-slate-500">SCORE</span>
        </div>
      </div>

      {/* STAR progress */}
      <div className="flex gap-2">
        {starParts.map(({ key, label }) => (
          <div
            key={key}
            className={`flex flex-col items-center rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-300 ${
              starProgress[key]
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-slate-800 text-slate-500"
            }`}
            title={
              starPacing
                ? `${label}: ${formatPacingSeconds(starPacing[key])} in this phase (keyword-based)`
                : label
            }
          >
            <span className="font-bold">{key}</span>
            {starPacing && (
              <span className="mt-0.5 font-mono text-[10px] text-slate-500">
                {formatPacingSeconds(starPacing[key])}
              </span>
            )}
          </div>
        ))}
      </div>
      {starPacing && (
        <p className="text-center text-[10px] text-slate-500">
          Answer {formatPacingSeconds(starPacing.total)} · aim ~2–3 min total
        </p>
      )}
    </div>
  );
}
