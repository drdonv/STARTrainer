import type {
  FillerWordResult,
  HeuristicState,
  StarProgress,
  FeedbackType,
} from "@/lib/types";

const FILLER_PATTERNS = [
  /\bum+\b/gi,
  /\buh+\b/gi,
  /\blike\b/gi,
  /\byou know\b/gi,
  /\bbasically\b/gi,
  /\bactually\b/gi,
  /\bhonestly\b/gi,
  /\bliterally\b/gi,
  /\bi mean\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\bright\?/gi,
];

export function detectFillerWords(text: string): FillerWordResult {
  const words: string[] = [];
  let count = 0;

  for (const pattern of FILLER_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      count += matches.length;
      words.push(...matches.map((m) => m.toLowerCase()));
    }
  }

  const totalWords = text.split(/\s+/).filter(Boolean).length;
  const density = totalWords > 0 ? count / totalWords : 0;

  return { count, words, density };
}

const SITUATION_SIGNALS = [
  /\b(at|when i was at|while at|working at|on the team)\b/i,
  /\b(the context was|the situation was|we were|there was)\b/i,
  /\b(my team|our team|the project|the company)\b/i,
  /\b(back in|at the time|during)\b/i,
];

const TASK_SIGNALS = [
  /\b(my role was|i was responsible|i was tasked|i needed to|my job was)\b/i,
  /\b(the goal was|the objective|we needed to|the challenge was)\b/i,
  /\b(i had to|was assigned|expected to)\b/i,
];

const ACTION_SIGNALS = [
  /\b(i did|i built|i wrote|i created|i designed|i implemented)\b/i,
  /\b(i decided to|i chose to|i proposed|i led|i drove|i initiated)\b/i,
  /\b(my approach|i took the approach|i set up|i refactored)\b/i,
  /\b(i talked to|i convinced|i presented|i worked with)\b/i,
];

const RESULT_SIGNALS = [
  /\b(as a result|the outcome|the result was|in the end)\b/i,
  /\b(we shipped|we launched|we delivered|we reduced|we improved)\b/i,
  /\b(the impact|it resulted in|which led to|that saved)\b/i,
  /\b(percent|%|faster|slower|reduced|increased|improved)\b/i,
  /\b(i learned|the takeaway|looking back)\b/i,
];

function hasSignals(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function checkStarProgress(fullTranscript: string): StarProgress {
  return {
    S: hasSignals(fullTranscript, SITUATION_SIGNALS),
    T: hasSignals(fullTranscript, TASK_SIGNALS),
    A: hasSignals(fullTranscript, ACTION_SIGNALS),
    R: hasSignals(fullTranscript, RESULT_SIGNALS),
  };
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

interface TriggerResult {
  shouldTrigger: boolean;
  type: FeedbackType | null;
  heuristicMessage: string | null;
}

const FILLER_BURST_THRESHOLD = 3;
const FILLER_WINDOW_MS = 15000;
const STAR_STALL_MS = 20000;
const RAMBLE_WORD_LIMIT = 150;

/** Align with grading: nudge situation if still no S after grace + buffer. */
const NO_SITUATION_MS = 12_000;
/** S seen but no task/action advance. */
const LONG_SITUATION_NO_TASK_MS = 40_000;
/** Action without result for too long. */
const LONG_ACTION_NO_RESULT_MS = 95_000;
/** Overall answer very long without a result. */
const LONG_ANSWER_NO_RESULT_MS = 180_000;

export function evaluateTrigger(state: HeuristicState): TriggerResult {
  const now = Date.now();

  // Check filler word burst in the rolling window
  const recentFillers = state.fillerTimestamps.filter(
    (t) => now - t < FILLER_WINDOW_MS
  );
  if (recentFillers.length >= FILLER_BURST_THRESHOLD) {
    return {
      shouldTrigger: true,
      type: "filler",
      heuristicMessage: "Stop. Too many filler words. Slow down and speak deliberately.",
    };
  }

  const elapsed = now - state.answerStartTime;
  const { S, T, A, R } = state.starProgress;
  const fs = state.starFirstSeen;

  // Preamble: enter Situation soon (matches ~10s grading grace + small buffer)
  if (
    fs.S === undefined &&
    elapsed > NO_SITUATION_MS &&
    !S
  ) {
    return {
      shouldTrigger: true,
      type: "star",
      heuristicMessage:
        "Stop. Set the situation now — where you were and what was going on.",
    };
  }

  // Long situation without task or action
  if (
    fs.S !== undefined &&
    S &&
    !T &&
    !A &&
    now - fs.S > LONG_SITUATION_NO_TASK_MS
  ) {
    return {
      shouldTrigger: true,
      type: "conciseness",
      heuristicMessage:
        "Stop. Tighten the setup — move to your task or what you owned.",
    };
  }

  // Long action section without result
  if (fs.A !== undefined && A && !R && now - fs.A > LONG_ACTION_NO_RESULT_MS) {
    return {
      shouldTrigger: true,
      type: "star",
      heuristicMessage:
        "Stop. Wrap the action — give a clear result or metric.",
    };
  }

  // Very long answer still missing result after action
  if (
    elapsed > LONG_ANSWER_NO_RESULT_MS &&
    A &&
    !R
  ) {
    return {
      shouldTrigger: true,
      type: "star",
      heuristicMessage:
        "Stop. You're out of time for setup — state the outcome now.",
    };
  }

  // STAR stall for cases not covered by first-hit timers (40s setup / 95s action / 12s preamble).
  const timeSinceStarChange = now - state.lastStarChangeTime;
  if (elapsed > 10000 && timeSinceStarChange > STAR_STALL_MS) {
    if (S && T && !A) {
      return {
        shouldTrigger: true,
        type: "star",
        heuristicMessage:
          "Stop. Move to what you did — your specific actions and decisions.",
      };
    }
  }

  // Check rambling: too many words without advancing through STAR
  const starCount = [S, T, A, R].filter(Boolean).length;
  if (state.wordCount > RAMBLE_WORD_LIMIT && starCount < 2) {
    return {
      shouldTrigger: true,
      type: "conciseness",
      heuristicMessage: "Stop. You're rambling. Get to the specific action you took.",
    };
  }

  if (state.wordCount > RAMBLE_WORD_LIMIT * 2 && starCount < 3) {
    return {
      shouldTrigger: true,
      type: "conciseness",
      heuristicMessage: "Stop. You're rambling. Give the outcome now.",
    };
  }

  return { shouldTrigger: false, type: null, heuristicMessage: null };
}
