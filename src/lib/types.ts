export type SessionState =
  | "idle"
  | "listening"
  | "interrupted"
  | "followUp"
  | "summary";

export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface StarProgress {
  S: boolean;
  T: boolean;
  A: boolean;
  R: boolean;
}

export type StarLetter = keyof StarProgress;

/** Seconds spent in each STAR phase (derived from first regex hit timestamps). */
export interface StarSegmentSeconds {
  S: number;
  T: number;
  A: number;
  R: number;
  /** Wall-clock answer length from answer start. */
  total: number;
}

export type FeedbackType = "filler" | "star" | "conciseness" | "content";

export interface CoachingFeedback {
  action: "coach" | "ok";
  type: FeedbackType | null;
  message: string;
  star_progress: StarProgress;
  score_adjustment: number;
}

export interface FillerWordResult {
  count: number;
  words: string[];
  density: number;
}

export interface HeuristicState {
  fillerWordsInWindow: number;
  totalFillerWords: number;
  starProgress: StarProgress;
  /** First time each STAR signal matched (ms since epoch). */
  starFirstSeen: Partial<Record<StarLetter, number>>;
  wordCount: number;
  answerStartTime: number;
  lastStarChangeTime: number;
  fillerTimestamps: number[];
}

export interface InterviewQuestion {
  id: string;
  text: string;
  category: "behavioral" | "technical";
}

export interface InterruptionRecord {
  type: FeedbackType;
  message: string;
  timestamp: number;
}

export interface SessionSummaryData {
  overallScore: number;
  interruptionsByType: Record<FeedbackType, number>;
  starBreakdown: StarProgress;
  fillerWordCount: number;
  fillerWords: string[];
  biggestWeakness: string;
  rewrittenAnswer: string;
  totalDuration: number;
  questionsAnswered: number;
  /**
   * Pacing for the last answer transcript sent to summary (same caveat as transcript:
   * end-of-session summary only reflects the final answer’s text).
   */
  starTimingSeconds?: StarSegmentSeconds;
}
