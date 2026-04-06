"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeClient } from "@/lib/realtime/client";
import {
  formatRealtimeErrorEvent,
  type TranscriptionDeltaEvent,
  type ResponseDoneEvent,
} from "@/lib/realtime/events";
import { useAudioCapture } from "./useAudioCapture";
import {
  detectFillerWords,
  checkStarProgress,
  countWords,
  evaluateTrigger,
} from "@/lib/feedback/analyzer";
import {
  applyModelAdjustment,
  calculateRawScore,
  smoothScore,
} from "@/lib/feedback/scoring";
import {
  COACHING_MESSAGE_MAX,
  FOLLOWUP_QUESTION_MAX,
  parseCoachingFeedback,
  parseSummaryFields,
  SUMMARY_STRING_MAX,
  toCoachingFeedback,
} from "@/lib/feedback/modelResponse";
import {
  computeStarSegmentsForState,
  formatStarTimingContext,
} from "@/lib/feedback/starTiming";
import {
  buildCoachingEvalPrompt,
  buildFollowUpPrompt,
  buildSummaryPrompt,
  COACHING_SYSTEM_PROMPT,
} from "@/lib/feedback/prompts";
import { getRandomQuestion } from "@/lib/questions";
import type {
  SessionState,
  StarProgress,
  InterviewQuestion,
  InterruptionRecord,
  HeuristicState,
  SessionSummaryData,
  FeedbackType,
  StarLetter,
  StarSegmentSeconds,
} from "@/lib/types";

const EVAL_INTERVAL_MS = 12000;
const COACHING_DISPLAY_DURATION_MS = 5000;
const COOLDOWN_MS = 8000;

type DeferredRealtimeResponse =
  | { kind: "followup"; prompt: string }
  | { kind: "summary"; prompt: string };

export function useRealtimeInterview() {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [transcript, setTranscript] = useState("");
  const [currentQuestion, setCurrentQuestion] =
    useState<InterviewQuestion | null>(null);
  const [score, setScore] = useState(50);
  const [starProgress, setStarProgress] = useState<StarProgress>({
    S: false,
    T: false,
    A: false,
    R: false,
  });
  const [coachingAlert, setCoachingAlert] = useState<{
    message: string;
    type: FeedbackType;
  } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [summary, setSummary] = useState<SessionSummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);
  const [starPacing, setStarPacing] = useState<StarSegmentSeconds | null>(null);

  const clientRef = useRef<RealtimeClient | null>(null);
  const summaryTimingRef = useRef<StarSegmentSeconds | null>(null);
  const heuristicStateRef = useRef<HeuristicState>({
    fillerWordsInWindow: 0,
    totalFillerWords: 0,
    starProgress: { S: false, T: false, A: false, R: false },
    starFirstSeen: {},
    wordCount: 0,
    answerStartTime: Date.now(),
    lastStarChangeTime: Date.now(),
    fillerTimestamps: [],
  });
  const transcriptRef = useRef("");
  const evalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInterruptionTimeRef = useRef(0);
  const interruptionsRef = useRef<InterruptionRecord[]>([]);
  const askedQuestionsRef = useRef<Array<{ id: string; text: string }>>([]);
  const sessionStartTimeRef = useRef(0);
  const pendingResponseRef = useRef<"coaching" | "followup" | "summary" | null>(
    null
  );
  const responseAccumulatorRef = useRef("");
  const scoreRef = useRef(50);
  const deferredAfterCurrentResponseRef =
    useRef<DeferredRealtimeResponse | null>(null);
  const awaitingFollowUpRef = useRef(false);

  const handleAudioChunk = useCallback((base64Audio: string) => {
    clientRef.current?.appendAudio(base64Audio);
  }, []);

  const { isCapturing, start: startCapture, stop: stopCapture } =
    useAudioCapture({ onAudioChunk: handleAudioChunk });

  const showCoachingAlert = useCallback(
    (message: string, type: FeedbackType) => {
      const now = Date.now();
      if (now - lastInterruptionTimeRef.current < COOLDOWN_MS) return;
      lastInterruptionTimeRef.current = now;

      setCoachingAlert({ message, type });
      setSessionState("interrupted");

      interruptionsRef.current.push({ type, message, timestamp: now });

      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
      alertTimerRef.current = setTimeout(() => {
        setCoachingAlert(null);
        setSessionState("listening");
      }, COACHING_DISPLAY_DURATION_MS);
    },
    []
  );

  const requestCoachingEval = useCallback(() => {
    if (awaitingFollowUpRef.current) return;
    if (!clientRef.current?.isConnected) return;
    if (!currentQuestion) return;

    const now = Date.now();
    const elapsed = Math.round(
      (now - heuristicStateRef.current.answerStartTime) / 1000
    );
    const hs = heuristicStateRef.current;
    const context = `Fillers: ${hs.totalFillerWords}, Words: ${hs.wordCount}, STAR: S=${hs.starProgress.S} T=${hs.starProgress.T} A=${hs.starProgress.A} R=${hs.starProgress.R}`;
    const pacingContext = formatStarTimingContext(hs, now);

    const prompt = buildCoachingEvalPrompt(
      currentQuestion.text,
      transcriptRef.current,
      elapsed,
      context,
      pacingContext
    );

    pendingResponseRef.current = "coaching";
    responseAccumulatorRef.current = "";
    clientRef.current.requestOutOfBandResponse(prompt);
  }, [currentQuestion]);

  const processTranscript = useCallback(
    (newText: string) => {
      transcriptRef.current += " " + newText;
      const fullText = transcriptRef.current.trim();
      setTranscript(fullText);

      const hs = heuristicStateRef.current;

      // Filler words
      const fillerResult = detectFillerWords(newText);
      const now = Date.now();
      for (let i = 0; i < fillerResult.count; i++) {
        hs.fillerTimestamps.push(now);
      }
      hs.totalFillerWords += fillerResult.count;
      hs.fillerWordsInWindow = hs.fillerTimestamps.filter(
        (t) => now - t < 15000
      ).length;

      // STAR progress
      const newStar = checkStarProgress(fullText);
      const oldStar = hs.starProgress;
      if (
        newStar.S !== oldStar.S ||
        newStar.T !== oldStar.T ||
        newStar.A !== oldStar.A ||
        newStar.R !== oldStar.R
      ) {
        hs.lastStarChangeTime = now;
      }
      (["S", "T", "A", "R"] as const).forEach((k: StarLetter) => {
        if (newStar[k] && !oldStar[k] && hs.starFirstSeen[k] === undefined) {
          hs.starFirstSeen[k] = now;
        }
      });
      hs.starProgress = newStar;
      setStarProgress(newStar);

      // Word count
      hs.wordCount = countWords(fullText);

      // Score
      const rawScore = calculateRawScore(hs);
      const smoothed = smoothScore(scoreRef.current, rawScore);
      scoreRef.current = smoothed;
      setScore(smoothed);

      setStarPacing(computeStarSegmentsForState(hs, now));

      // Evaluate heuristic triggers
      const trigger = evaluateTrigger(hs);
      if (trigger.shouldTrigger && trigger.type && trigger.heuristicMessage) {
        showCoachingAlert(trigger.heuristicMessage, trigger.type);
        requestCoachingEval();
      }
    },
    [showCoachingAlert, requestCoachingEval]
  );

  const stripCodeFences = useCallback((text: string): string => {
    return text.replaceAll(/```json\n?/g, "").replaceAll(/```\n?/g, "").trim();
  }, []);

  const buildInterruptionsByType = useCallback((): Record<FeedbackType, number> => {
    const result: Record<FeedbackType, number> = {
      filler: 0, star: 0, conciseness: 0, content: 0,
    };
    for (const ir of interruptionsRef.current) {
      result[ir.type]++;
    }
    return result;
  }, []);

  const handleCoachingResponse = useCallback(
    (fullText: string) => {
      const feedback = parseCoachingFeedback(stripCodeFences(fullText));
      if (feedback) {
        if (feedback.action === "coach" && feedback.message) {
          showCoachingAlert(feedback.message, feedback.type ?? "content");
        }
        if (feedback.star_progress) {
          setStarProgress(feedback.star_progress);
          heuristicStateRef.current.starProgress = feedback.star_progress;
        }
        const merged = toCoachingFeedback(
          feedback,
          heuristicStateRef.current.starProgress
        );
        const newScore = applyModelAdjustment(scoreRef.current, merged);
        scoreRef.current = newScore;
        setScore(newScore);
        return;
      }
      const fallback = stripCodeFences(fullText).slice(0, COACHING_MESSAGE_MAX);
      if (
        fallback.toLowerCase().includes("stop") ||
        fallback.length < 100
      ) {
        showCoachingAlert(fallback, "content");
      }
    },
    [showCoachingAlert, stripCodeFences]
  );

  const handleSummaryResponse = useCallback((fullText: string) => {
    const cleaned = stripCodeFences(fullText);
    const fields = parseSummaryFields(cleaned, scoreRef.current);
    const timing =
      summaryTimingRef.current ??
      computeStarSegmentsForState(heuristicStateRef.current, Date.now());
    if (fields) {
      setSummary({
        overallScore: fields.overallScore,
        interruptionsByType: buildInterruptionsByType(),
        starBreakdown: heuristicStateRef.current.starProgress,
        fillerWordCount: heuristicStateRef.current.totalFillerWords,
        fillerWords: [],
        biggestWeakness: fields.biggestWeakness,
        rewrittenAnswer: fields.rewrittenAnswer,
        totalDuration: (Date.now() - sessionStartTimeRef.current) / 1000,
        questionsAnswered: askedQuestionsRef.current.length,
        starTimingSeconds: timing,
      });
    } else {
      setSummary({
        overallScore: scoreRef.current,
        interruptionsByType: buildInterruptionsByType(),
        starBreakdown: heuristicStateRef.current.starProgress,
        fillerWordCount: heuristicStateRef.current.totalFillerWords,
        fillerWords: [],
        biggestWeakness: "Unable to generate summary",
        rewrittenAnswer: fullText.slice(0, SUMMARY_STRING_MAX),
        totalDuration: (Date.now() - sessionStartTimeRef.current) / 1000,
        questionsAnswered: askedQuestionsRef.current.length,
        starTimingSeconds: timing,
      });
    }
    setSessionState("summary");
  }, [stripCodeFences, buildInterruptionsByType]);

  const handleResponseDone = useCallback(
    (event: ResponseDoneEvent) => {
      const responseType = pendingResponseRef.current;
      pendingResponseRef.current = null;

      const fullText =
        event.response?.output?.[0]?.content?.[0]?.text ||
        responseAccumulatorRef.current;
      responseAccumulatorRef.current = "";

      const chainDeferred = deferredAfterCurrentResponseRef.current;
      if (chainDeferred) {
        deferredAfterCurrentResponseRef.current = null;
        pendingResponseRef.current =
          chainDeferred.kind === "followup" ? "followup" : "summary";
        responseAccumulatorRef.current = "";
        clientRef.current?.requestOutOfBandResponse(chainDeferred.prompt);
        awaitingFollowUpRef.current = chainDeferred.kind === "followup";
        return;
      }

      if (responseType === "followup") {
        awaitingFollowUpRef.current = false;
      }

      if (!fullText) return;

      if (responseType === "coaching") {
        handleCoachingResponse(fullText);
      } else if (responseType === "followup") {
        setFollowUpQuestion(
          fullText.trim().slice(0, FOLLOWUP_QUESTION_MAX)
        );
        setSessionState("followUp");
      } else if (responseType === "summary") {
        handleSummaryResponse(fullText);
      }
    },
    [handleCoachingResponse, handleSummaryResponse]
  );

  const startSession = useCallback(async () => {
    setError(null);
    setSummary(null);
    setTranscript("");
    setScore(50);
    scoreRef.current = 50;
    setStarProgress({ S: false, T: false, A: false, R: false });
    setCoachingAlert(null);
    setFollowUpQuestion(null);
    interruptionsRef.current = [];
    askedQuestionsRef.current = [];
    transcriptRef.current = "";
    heuristicStateRef.current = {
      fillerWordsInWindow: 0,
      totalFillerWords: 0,
      starProgress: { S: false, T: false, A: false, R: false },
      starFirstSeen: {},
      wordCount: 0,
      answerStartTime: Date.now(),
      lastStarChangeTime: Date.now(),
      fillerTimestamps: [],
    };
    setStarPacing(null);
    summaryTimingRef.current = null;
    deferredAfterCurrentResponseRef.current = null;
    awaitingFollowUpRef.current = false;

    try {
      // Get ephemeral token
      const tokenRes = await fetch("/api/realtime-session", {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (!tokenRes.ok) {
        let errMessage = "Failed to get session token";
        try {
          const errData: unknown = await tokenRes.json();
          if (
            errData &&
            typeof errData === "object" &&
            typeof (errData as { error?: unknown }).error === "string"
          ) {
            errMessage = (errData as { error: string }).error;
          }
        } catch {
          // Ignore parsing errors and fall back to status-based messages.
        }
        if (tokenRes.status === 401) {
          errMessage = "Please sign in to start an interview session.";
        } else if (tokenRes.status === 429) {
          errMessage = "Too many attempts. Please wait a moment and try again.";
        }
        throw new Error(errMessage);
      }
      const tokenBody: unknown = await tokenRes.json();
      if (
        !tokenBody ||
        typeof tokenBody !== "object" ||
        typeof (tokenBody as { token?: unknown }).token !== "string"
      ) {
        throw new Error("Invalid session token from server");
      }
      const { token } = tokenBody as { token: string };

      // Connect WebSocket
      const client = new RealtimeClient();
      clientRef.current = client;
      await client.connect(token);

      // Configure session (GA format: nested audio config + type: "realtime")
      await client.updateSession({
        type: "realtime",
        instructions: COACHING_SYSTEM_PROMPT,
        output_modalities: ["text"],
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: false,
            },
          },
        },
      });

      // Set up event listeners
      client.on(
        "conversation.item.input_audio_transcription.delta",
        (e) => {
          const event = e as unknown as TranscriptionDeltaEvent;
          processTranscript(event.delta);
        }
      );

      client.on(
        "conversation.item.input_audio_transcription.completed",
        () => {
          // Final transcript handled by delta events above; completed is for reconciliation
        }
      );

      client.on("input_audio_buffer.speech_started", () => {
        setIsSpeaking(true);
      });

      client.on("input_audio_buffer.speech_stopped", () => {
        setIsSpeaking(false);
      });

      client.on("response.done", (e) => {
        handleResponseDone(e as unknown as ResponseDoneEvent);
      });

      client.on("error", (e) => {
        const summary = formatRealtimeErrorEvent(e);
        console.error("Realtime API error:", summary);
      });

      // Start audio capture
      await startCapture();

      // Set first question
      const question = getRandomQuestion();
      setCurrentQuestion(question);
      askedQuestionsRef.current.push({
        id: question.id,
        text: question.text,
      });
      sessionStartTimeRef.current = Date.now();
      heuristicStateRef.current.answerStartTime = Date.now();
      heuristicStateRef.current.lastStarChangeTime = Date.now();

      // Start periodic eval timer
      evalTimerRef.current = setInterval(() => {
        if (transcriptRef.current.trim().length > 20) {
          requestCoachingEval();
        }
      }, EVAL_INTERVAL_MS);

      setSessionState("listening");
    } catch (err) {
      console.error("Failed to start session:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start session"
      );
      setSessionState("idle");
    }
  }, [startCapture, processTranscript, handleResponseDone, requestCoachingEval]);

  const endAnswer = useCallback(() => {
    if (!clientRef.current?.isConnected || !currentQuestion) return;

    const prompt = buildFollowUpPrompt(
      currentQuestion.text,
      transcriptRef.current,
      heuristicStateRef.current.starProgress
    );
    awaitingFollowUpRef.current = true;
    if (pendingResponseRef.current !== null) {
      deferredAfterCurrentResponseRef.current = { kind: "followup", prompt };
      return;
    }

    pendingResponseRef.current = "followup";
    responseAccumulatorRef.current = "";
    clientRef.current.requestOutOfBandResponse(prompt);
  }, [currentQuestion]);

  const nextQuestion = useCallback(
    (questionOverride?: string) => {
      // Reset per-answer state
      transcriptRef.current = "";
      setTranscript("");
      heuristicStateRef.current = {
        fillerWordsInWindow: 0,
        totalFillerWords: 0,
        starProgress: { S: false, T: false, A: false, R: false },
        starFirstSeen: {},
        wordCount: 0,
        answerStartTime: Date.now(),
        lastStarChangeTime: Date.now(),
        fillerTimestamps: [],
      };
      setStarProgress({ S: false, T: false, A: false, R: false });
      setStarPacing(null);
      scoreRef.current = 50;
      setScore(50);
      setCoachingAlert(null);
      setFollowUpQuestion(null);
      lastInterruptionTimeRef.current = 0;
      deferredAfterCurrentResponseRef.current = null;
      awaitingFollowUpRef.current = false;

      if (questionOverride) {
        const q: InterviewQuestion = {
          id: `followup-${Date.now()}`,
          text: questionOverride,
          category: "behavioral",
        };
        setCurrentQuestion(q);
        askedQuestionsRef.current.push({ id: q.id, text: q.text });
      } else {
        const q = getRandomQuestion(
          askedQuestionsRef.current.map((x) => x.id)
        );
        setCurrentQuestion(q);
        askedQuestionsRef.current.push({ id: q.id, text: q.text });
      }

      setSessionState("listening");
    },
    []
  );

  const endSession = useCallback(() => {
    // Stop microphone capture immediately when the user ends the session.
    stopCapture();
    setIsSpeaking(false);

    if (evalTimerRef.current) {
      clearInterval(evalTimerRef.current);
      evalTimerRef.current = null;
    }

    if (clientRef.current?.isConnected && transcriptRef.current.trim()) {
      const hs = heuristicStateRef.current;
      const now = Date.now();
      summaryTimingRef.current = computeStarSegmentsForState(hs, now);
      const starPacingLine = formatStarTimingContext(hs, now);

      const prompt = buildSummaryPrompt(
        askedQuestionsRef.current.map((q) => q.text),
        transcriptRef.current,
        interruptionsRef.current.length,
        hs.totalFillerWords,
        hs.starProgress,
        starPacingLine
      );
      if (pendingResponseRef.current === null) {
        pendingResponseRef.current = "summary";
        responseAccumulatorRef.current = "";
        clientRef.current.requestOutOfBandResponse(prompt);
      } else {
        deferredAfterCurrentResponseRef.current = { kind: "summary", prompt };
      }
    } else {
      const pacing = computeStarSegmentsForState(
        heuristicStateRef.current,
        Date.now()
      );
      setSessionState("summary");
      setSummary({
        overallScore: scoreRef.current,
        interruptionsByType: { filler: 0, star: 0, conciseness: 0, content: 0 },
        starBreakdown: heuristicStateRef.current.starProgress,
        fillerWordCount: heuristicStateRef.current.totalFillerWords,
        fillerWords: [],
        biggestWeakness: "Session ended without enough data.",
        rewrittenAnswer: "",
        totalDuration: (Date.now() - sessionStartTimeRef.current) / 1000,
        questionsAnswered: askedQuestionsRef.current.length,
        starTimingSeconds: pacing,
      });
    }

    setTimeout(() => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    }, 5000);
  }, [stopCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (evalTimerRef.current) clearInterval(evalTimerRef.current);
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
      clientRef.current?.disconnect();
    };
  }, []);

  // Refresh keyword-derived pacing every second while answering (wall clock / segments)
  useEffect(() => {
    if (sessionState !== "listening" && sessionState !== "interrupted") {
      return;
    }
    const tick = () => {
      setStarPacing(
        computeStarSegmentsForState(heuristicStateRef.current, Date.now())
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionState]);

  return {
    sessionState,
    transcript,
    currentQuestion,
    score,
    starProgress,
    starPacing,
    coachingAlert,
    isSpeaking,
    isCapturing,
    summary,
    error,
    followUpQuestion,
    startSession,
    endAnswer,
    nextQuestion,
    endSession,
  };
}
