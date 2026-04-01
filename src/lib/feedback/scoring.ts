import type { StarProgress, HeuristicState, CoachingFeedback } from "@/lib/types";
import { starTimingPenaltyForState } from "@/lib/feedback/starTiming";

const EMA_ALPHA = 0.3;

function starScore(progress: StarProgress): number {
  const parts = [progress.S, progress.T, progress.A, progress.R];
  const completed = parts.filter(Boolean).length;
  return (completed / 4) * 40; // 0-40 points from STAR
}

function fillerPenalty(totalFillers: number, wordCount: number): number {
  if (wordCount === 0) return 0;
  const density = totalFillers / wordCount;
  // 0% fillers = 0 penalty, 5%+ = -25 max penalty
  return Math.min(density / 0.05, 1) * 25;
}

function concisePenalty(wordCount: number, elapsedSeconds: number): number {
  if (elapsedSeconds < 10) return 0;
  const wordsPerSecond = wordCount / elapsedSeconds;
  // Ideal is ~2.5 wps. Penalize for very slow or verbose delivery.
  if (wordsPerSecond > 4) return 10; // too fast / rambling
  if (wordCount > 300) return 15; // very long answer
  return 0;
}

export function calculateRawScore(state: HeuristicState): number {
  const now = Date.now();
  const star = starScore(state.starProgress);
  const elapsed = (now - state.answerStartTime) / 1000;
  const filler = fillerPenalty(state.totalFillerWords, state.wordCount);
  const concise = concisePenalty(state.wordCount, elapsed);
  const timing = starTimingPenaltyForState(state, now);

  // Base 50 + STAR bonus - penalties, clamped to 0-100
  const raw = 50 + star - filler - concise - timing;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function applyModelAdjustment(
  currentScore: number,
  feedback: CoachingFeedback
): number {
  const adjusted = currentScore + feedback.score_adjustment;
  return Math.max(0, Math.min(100, Math.round(adjusted)));
}

export function smoothScore(
  previousSmoothed: number,
  newRaw: number
): number {
  return Math.round(EMA_ALPHA * newRaw + (1 - EMA_ALPHA) * previousSmoothed);
}
