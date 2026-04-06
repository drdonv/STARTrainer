"use client";

/* Re-enable sign-in UI: import SignInButton from @clerk/nextjs and uncomment the two SignInButton blocks below (header + idle). */
import {
  // SignInButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import { useRealtimeInterview } from "@/hooks/useRealtimeInterview";
import { StatusIndicator } from "./StatusIndicator";
import { QuestionCard } from "./QuestionCard";
import { TranscriptDisplay } from "./TranscriptDisplay";
import { ScoreBadge } from "./ScoreBadge";
import { CoachingAlert } from "./CoachingAlert";
import { SessionSummary } from "./SessionSummary";

export function InterviewCoach() {
  const { isSignedIn } = useAuth();
  const {
    sessionState,
    transcript,
    currentQuestion,
    score,
    starProgress,
    starPacing,
    coachingAlert,
    isSpeaking,
    summary,
    error,
    followUpQuestion,
    startSession,
    endAnswer,
    nextQuestion,
    endSession,
  } = useRealtimeInterview();

  if (sessionState === "summary" && summary) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <SessionSummary summary={summary} onRestart={startSession} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      {/* Coaching alert overlay */}
      {coachingAlert && (
        <CoachingAlert message={coachingAlert.message} type={coachingAlert.type} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            Interview Coach
          </h1>
          <p className="text-xs text-slate-500">Real-time STAR coaching</p>
        </div>
        <div className="flex items-center gap-4">
          <StatusIndicator state={sessionState} />
          {isSignedIn ? <UserButton /> : null}
          {/*
          <SignInButton mode="modal">
            <button className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800">
              Sign In
            </button>
          </SignInButton>
          */}
        </div>
      </div>

      {/* Idle state */}
      {sessionState === "idle" && (
        <div className="flex flex-col items-center gap-8 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white">
              Ready to practice?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              Start a mock behavioral interview. The coach will listen to your
              answer in real time and interrupt you with blunt, actionable
              feedback when you ramble, use filler words, or skip parts of the
              STAR framework.
            </p>
          </div>

          {error && (
            <div className="w-full max-w-md rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={startSession}
            className="rounded-xl bg-white px-10 py-4 text-base font-semibold text-slate-900 shadow-lg shadow-white/10 transition-all hover:bg-slate-100 hover:shadow-white/20 active:scale-[0.98]"
          >
            Start Interview
          </button>
          {/*
          <SignInButton mode="modal">
            <button className="rounded-xl bg-white px-10 py-4 text-base font-semibold text-slate-900 shadow-lg shadow-white/10 transition-all hover:bg-slate-100 hover:shadow-white/20 active:scale-[0.98]">
              Sign in to Start
            </button>
          </SignInButton>
          */}

          <p className="text-xs text-slate-600">
            Requires microphone access &middot; Works best in Chrome
          </p>
        </div>
      )}

      {/* Active interview */}
      {sessionState !== "idle" && sessionState !== "summary" && (
        <>
          {/* Question + Score row */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto]">
            <QuestionCard
              question={currentQuestion}
              followUpQuestion={
                sessionState === "followUp" ? followUpQuestion : null
              }
            />
            <div className="flex justify-center sm:justify-end">
              <ScoreBadge
                score={score}
                starProgress={starProgress}
                starPacing={starPacing}
              />
            </div>
          </div>

          {/* Transcript */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Live Transcript
              </h3>
              {isSpeaking && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Speaking
                </span>
              )}
            </div>
            <TranscriptDisplay
              transcript={transcript}
              isSpeaking={isSpeaking}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {sessionState === "listening" && (
              <button
                onClick={endAnswer}
                className="rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
              >
                Done Answering
              </button>
            )}

            {sessionState === "followUp" && followUpQuestion && (
              <button
                onClick={() => nextQuestion(followUpQuestion)}
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Answer Follow-up
              </button>
            )}

            {sessionState === "followUp" && (
              <button
                onClick={() => nextQuestion()}
                className="rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
              >
                New Question
              </button>
            )}

            <button
              onClick={endSession}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              End Session
            </button>
          </div>
        </>
      )}
    </div>
  );
}
