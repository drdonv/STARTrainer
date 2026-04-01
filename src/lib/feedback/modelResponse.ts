import type { CoachingFeedback, FeedbackType, StarProgress } from "@/lib/types";

export const COACHING_MESSAGE_MAX = 500;
export const SUMMARY_STRING_MAX = 8000;
export const FOLLOWUP_QUESTION_MAX = 600;
const SCORE_ADJUST_MIN = -15;
const SCORE_ADJUST_MAX = 5;

function isBool(x: unknown): x is boolean {
  return typeof x === "boolean";
}

const FEEDBACK_TYPES = new Set<FeedbackType>([
  "filler",
  "star",
  "conciseness",
  "content",
]);

function coerceFeedbackType(x: unknown): FeedbackType | null {
  if (typeof x !== "string") return null;
  return FEEDBACK_TYPES.has(x as FeedbackType) ? (x as FeedbackType) : null;
}

function coerceStarProgress(x: unknown): StarProgress | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!isBool(o.S) || !isBool(o.T) || !isBool(o.A) || !isBool(o.R)) {
    return null;
  }
  return { S: o.S, T: o.T, A: o.A, R: o.R };
}

export interface ParsedCoachingFeedback {
  action: "coach" | "ok";
  type: FeedbackType | null;
  message: string;
  score_adjustment: number;
  /** Only set when the model sent a valid object — avoids wiping regex STAR. */
  star_progress?: StarProgress;
}

/**
 * Validates model JSON so string/oversized fields cannot break scoring or the UI.
 */
export function parseCoachingFeedback(jsonText: string): ParsedCoachingFeedback | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;

  if (o.action !== "coach" && o.action !== "ok") return null;

  const message =
    typeof o.message === "string"
      ? o.message.slice(0, COACHING_MESSAGE_MAX)
      : "";

  const type = o.type === null || o.type === undefined
    ? null
    : coerceFeedbackType(o.type);

  const starParsed = coerceStarProgress(o.star_progress);
  let score_adjustment = 0;
  if (typeof o.score_adjustment === "number" && Number.isFinite(o.score_adjustment)) {
    score_adjustment = Math.max(
      SCORE_ADJUST_MIN,
      Math.min(SCORE_ADJUST_MAX, Math.trunc(o.score_adjustment))
    );
  }

  const out: ParsedCoachingFeedback = {
    action: o.action,
    type,
    message,
    score_adjustment,
  };
  if (starParsed) {
    out.star_progress = starParsed;
  }
  return out;
}

/** For APIs that require a full `CoachingFeedback` (e.g. score merge). */
export function toCoachingFeedback(
  parsed: ParsedCoachingFeedback,
  fallbackStar: StarProgress
): CoachingFeedback {
  return {
    action: parsed.action,
    type: parsed.type,
    message: parsed.message,
    star_progress: parsed.star_progress ?? fallbackStar,
    score_adjustment: parsed.score_adjustment,
  };
}

export interface ParsedSummaryFields {
  overallScore: number;
  biggestWeakness: string;
  rewrittenAnswer: string;
}

export function parseSummaryFields(
  jsonText: string,
  fallbackScore: number
): ParsedSummaryFields | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;

  let overallScore = fallbackScore;
  if (typeof o.overallScore === "number" && Number.isFinite(o.overallScore)) {
    overallScore = Math.max(0, Math.min(100, Math.round(o.overallScore)));
  }

  const biggestWeakness =
    typeof o.biggestWeakness === "string"
      ? o.biggestWeakness.slice(0, SUMMARY_STRING_MAX)
      : "N/A";

  const rewrittenAnswer =
    typeof o.rewrittenAnswer === "string"
      ? o.rewrittenAnswer.slice(0, SUMMARY_STRING_MAX)
      : "N/A";

  return { overallScore, biggestWeakness, rewrittenAnswer };
}
