"use client";

import type { SessionSummaryData, FeedbackType } from "@/lib/types";
import { STAR_TIMING_TARGETS } from "@/lib/feedback/starTiming";

interface SessionSummaryProps {
  summary: SessionSummaryData;
  onRestart: () => void;
}

const TYPE_LABELS: Record<FeedbackType, string> = {
  filler: "Filler Words",
  star: "STAR Structure",
  conciseness: "Conciseness",
  content: "Content Quality",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function SessionSummary({ summary, onRestart }: SessionSummaryProps) {
  const totalInterruptions = Object.values(summary.interruptionsByType).reduce(
    (a, b) => a + b,
    0
  );

  const starParts = [
    { key: "S" as const, label: "Situation" },
    { key: "T" as const, label: "Task" },
    { key: "A" as const, label: "Action" },
    { key: "R" as const, label: "Result" },
  ];

  return (
    <div className="animate-[slide-up_0.4s_ease-out] space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Session Summary</h2>
        <p className="mt-1 text-sm text-slate-400">
          {summary.questionsAnswered} question{summary.questionsAnswered !== 1 ? "s" : ""} &middot;{" "}
          {formatDuration(summary.totalDuration)}
        </p>
      </div>

      {/* Score + stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Overall Score"
          value={`${summary.overallScore}`}
          color={
            summary.overallScore >= 70
              ? "text-emerald-400"
              : summary.overallScore >= 40
                ? "text-amber-400"
                : "text-red-400"
          }
        />
        <StatCard
          label="Interruptions"
          value={`${totalInterruptions}`}
          color="text-orange-400"
        />
        <StatCard
          label="Filler Words"
          value={`${summary.fillerWordCount}`}
          color="text-amber-400"
        />
        <StatCard
          label="Questions"
          value={`${summary.questionsAnswered}`}
          color="text-blue-400"
        />
      </div>

      {/* Interruption breakdown */}
      {totalInterruptions > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Interruptions by Type
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(summary.interruptionsByType) as [FeedbackType, number][])
              .filter(([, count]) => count > 0)
              .map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-2"
                >
                  <span className="text-sm text-slate-300">
                    {TYPE_LABELS[type]}
                  </span>
                  <span className="font-mono text-sm font-bold text-white">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* STAR breakdown */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
          STAR Completion
        </h3>
        <div className="flex gap-3">
          {starParts.map(({ key, label }) => (
            <div
              key={key}
              className={`flex flex-1 flex-col items-center rounded-lg py-3 ${
                summary.starBreakdown[key]
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              <span className="text-lg font-bold">{key}</span>
              <span className="text-xs">{label}</span>
              <span className="mt-1 text-xs font-semibold">
                {summary.starBreakdown[key] ? "✓" : "✗"}
              </span>
            </div>
          ))}
        </div>
        {summary.starTimingSeconds && (
          <p className="mt-4 border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-400">Last answer pacing</span>{" "}
            (keyword-based, final transcript only): wall{" "}
            {formatDuration(summary.starTimingSeconds.total)} — S{" "}
            {Math.round(summary.starTimingSeconds.S)}s / T{" "}
            {Math.round(summary.starTimingSeconds.T)}s / A{" "}
            {Math.round(summary.starTimingSeconds.A)}s / R{" "}
            {Math.round(summary.starTimingSeconds.R)}s. Targets: ~2–3 min total;
            situation within ~{STAR_TIMING_TARGETS.preambleGraceS}s; S ~30s, T ~15s,
            A ~60–80s, R ~15–30s.
          </p>
        )}
      </div>

      {/* Biggest weakness */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Key Area to Improve
        </h3>
        <p className="text-sm leading-relaxed text-slate-200">
          {summary.biggestWeakness}
        </p>
      </div>

      {/* Rewritten answer */}
      {summary.rewrittenAnswer && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Stronger Answer Example
          </h3>
          <p className="text-sm italic leading-relaxed text-slate-300">
            &ldquo;{summary.rewrittenAnswer}&rdquo;
          </p>
        </div>
      )}

      {/* Restart button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={onRestart}
          className="rounded-xl bg-slate-100 px-8 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-white"
        >
          Start New Session
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-center">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
