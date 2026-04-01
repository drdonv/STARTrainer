# Live Voice Interview Coach

A real-time behavioral interview coach that listens while you speak and **interrupts you mid-answer** with blunt, actionable feedback. Built with Next.js, TypeScript, and the OpenAI Realtime API over WebSockets.

> The defining feature is not post-hoc analysis — it is the live interruption. If you ramble, overuse filler words, or stall on STAR structure while speaking, the app hard-stops you immediately.

---

## What It Does

1. **Start a session** — the app presents a behavioral interview question (e.g. *"Tell me about a time you disagreed with a teammate."*).
2. **Speak your answer** — microphone audio streams continuously to the OpenAI Realtime API via WebSocket; Whisper transcribes it in real time.
3. **Get interrupted** — a hybrid feedback engine (deterministic heuristics + live GPT-4o judgment) fires a hard-stop coaching overlay mid-answer when a threshold is crossed:
   - *"Stop. Too many filler words. Slow down and speak deliberately."*
   - *"Stop. Set the situation now — where you were and what was going on."*
   - *"Stop. You're rambling. Get to the specific action you took."*
4. **See your score live** — a rolling 0–100 confidence score updates continuously, smoothed with an exponential moving average to avoid jitter.
5. **Answer a follow-up** — after each answer, GPT-4o generates one targeted follow-up question probing the weakest part of your response (missing Result, vague Action, lack of specificity, etc.).
6. **Review your session** — a post-session summary includes overall score, interruption counts by type, STAR completion breakdown, filler word tally, a one-sentence diagnosis of your biggest weakness, and a GPT-4o-rewritten stronger version of your answer.

---

## Architecture

### Security model

The browser never holds the full OpenAI API key. A Next.js API route (`POST /api/realtime-session`) mints a short-lived **ephemeral token** server-side by calling `https://api.openai.com/v1/realtime/client_secrets`. The browser uses this token as a WebSocket subprotocol credential, giving it a scoped, time-limited connection with no permanent key exposure.

### Audio pipeline

```
getUserMedia (24kHz mono, echo cancellation, noise suppression)
    → ScriptProcessorNode (4096-sample buffer)
    → downsampleTo24kHz() [float32 → 24kHz float32]
    → base64EncodeAudio() [float32 → 16-bit PCM → base64]
    → input_audio_buffer.append (WebSocket frame to OpenAI)
```

The `AudioContext` is locked to 24 kHz to match the Realtime API's expected input format. Downsampling is done in a `Float32Array` typed array loop for performance.

### Realtime session design

- Model: `gpt-4o-realtime-preview`
- Input modality: PCM audio (streamed continuously)
- Output modality: **text only** (v1; voice TTS is a natural future extension)
- Turn detection: **server VAD** with `create_response: false` — the model detects speech boundaries for transcription but does **not** auto-generate responses, preserving manual control over when the model speaks
- Transcription: Whisper-1, English, near-field noise reduction
- All coaching, follow-up, and summary requests use **`conversation: "none"`** out-of-band responses so they don't pollute the main conversation thread

### Feedback engine (hybrid)

**Deterministic heuristics run first** (zero latency, predictable):

| Signal | Threshold | Interrupt type |
|--------|-----------|----------------|
| ≥3 filler words in a 15s window | immediate | `filler` |
| No Situation keyword after 12s | 12s elapsed | `star` |
| Situation but no Task/Action after 40s | since S first seen | `conciseness` |
| Action but no Result after 95s | since A first seen | `star` |
| >150 words with <2 STAR components | word count | `conciseness` |
| >300 words with <3 STAR components | word count | `conciseness` |

**GPT-4o judgment runs out-of-band** every 12 seconds (or immediately after a heuristic trigger). The model receives the rolling transcript, elapsed time, heuristic context, and STAR pacing data, and responds with a strict JSON contract:

```json
{
  "action": "coach" | "ok",
  "type": "filler" | "star" | "conciseness" | "content" | null,
  "message": "Stop. Your example is too vague — name what you specifically did.",
  "star_progress": { "S": true, "T": true, "A": false, "R": false },
  "score_adjustment": -5
}
```

The model can correct STAR detection (overriding regex heuristics) and apply fine-grained score adjustments clamped to `[-15, +5]`.

### Scoring pipeline

```
calculateRawScore(heuristicState)
    → base 50
    + starScore()        [+0 to +40, one component = +10]
    - fillerPenalty()    [up to -25, based on filler density]
    - concisePenalty()   [up to -15, for rambling or extreme word rate]
    - starTimingPenalty() [pacing penalty for spending too long in early phases]

smoothScore(previous, raw)  [EMA with α=0.3, prevents jitter]

applyModelAdjustment(score, feedback)  [model fine-tunes the score]
```

### Session state machine

```
idle → listening → interrupted → listening
                ↓ (endAnswer)
            followUp → listening (nextQuestion)
                ↓ (endSession)
            summary
```

### Deferred response chaining

If the user clicks "Done Answering" or "End Session" while a coaching response is already in-flight, the follow-up or summary prompt is **queued** in a deferred ref and dispatched the moment `response.done` fires. This prevents race conditions between concurrent out-of-band responses.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4 |
| AI | OpenAI Realtime API (`gpt-4o-realtime-preview`), Whisper-1 transcription |
| Transport | WebSocket (browser-native) |
| Audio | Web Audio API — `getUserMedia`, `AudioContext`, `ScriptProcessorNode` |
| Deployment | Vercel (zero-config, edge-ready) |
| Runtime deps | **Zero** beyond Next.js + React — no SDK, no external audio library, no state manager |

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/
│       └── realtime-session/
│           └── route.ts          # Ephemeral token endpoint
├── components/
│   ├── InterviewCoach.tsx        # Root UI, composes all below
│   ├── StatusIndicator.tsx       # idle / listening / interrupted / followUp / summary
│   ├── QuestionCard.tsx          # Current question + follow-up display
│   ├── TranscriptDisplay.tsx     # Live rolling transcript
│   ├── ScoreBadge.tsx            # 0-100 score + STAR progress + pacing
│   ├── CoachingAlert.tsx         # Hard-stop interrupt overlay
│   └── SessionSummary.tsx        # Post-session debrief screen
├── hooks/
│   ├── useRealtimeInterview.ts   # Session orchestration, all business logic
│   └── useAudioCapture.ts        # Mic → PCM base64 pipeline
└── lib/
    ├── types.ts                  # All domain types
    ├── questions.ts              # Question pool + random selection
    ├── realtime/
    │   ├── client.ts             # WebSocket client abstraction
    │   ├── events.ts             # Server event types and parsers
    │   └── audio.ts              # Downsample + base64 encode
    └── feedback/
        ├── analyzer.ts           # Filler regexes, STAR signals, trigger thresholds
        ├── scoring.ts            # Raw score, EMA smoothing, model adjustments
        ├── prompts.ts            # System prompts and prompt builders
        ├── modelResponse.ts      # JSON parsing, validation, fallbacks
        └── starTiming.ts         # STAR segment timing and pacing penalty
```

---

## Getting Started

**Prerequisites:** Node.js 18+, an OpenAI API key with Realtime API access, Chrome (recommended for `getUserMedia` + WebSocket reliability).

```bash
# Install dependencies
npm install

# Add your API key
echo "OPENAI_API_KEY=sk-..." > .env.local

# Start dev server
npm run dev
# → http://localhost:3000
```

```bash
# Build for production
npm run build

# Lint
npm run lint
```

**Deploying to Vercel:**

```bash
vercel deploy
```

Set `OPENAI_API_KEY` as an environment variable in your Vercel project settings. The API key is used only in the server-side route; it is never bundled into client JavaScript.

---

## Design Decisions Worth Noting

**Why `conversation: "none"` for coaching calls?** All evaluation, follow-up, and summary responses are sent as out-of-band requests that bypass the main conversation thread. This prevents coaching JSON from appearing as assistant turns in the session context and keeps the model's turn detection clean.

**Why heuristics before the model?** Regex-based filler and STAR detection responds in < 1ms with zero API cost. The model call follows as a secondary layer for cases that require judgment (vague content, nuanced STAR misses). This keeps the interrupt loop feeling immediate even on slow network conditions.

**Why server VAD with `create_response: false`?** We want Whisper transcription deltas without the model auto-generating a spoken reply every time the user pauses. Manual control over `response.create` is what enables the interruption-driven product primitive — the model speaks only when we tell it to.

**Why no database, no auth, no persistence?** Intentional. Every session is stateless and in-memory. This keeps the architectural surface minimal and the latency budget entirely on the WebSocket + feedback loop, which is where the UX lives.

---

## Possible Extensions

- **AudioWorklet** instead of `ScriptProcessorNode` for lower-latency audio processing off the main thread
- **Voice output** — the session is already configured for bidirectional Realtime; adding `output_modalities: ["audio"]` and wiring TTS playback is the natural next step
- **Session persistence** — store transcripts and scores server-side for longitudinal tracking
- **Resume / multi-session** — extend `askedQuestionsRef` to persist across refreshes
- **Technical interview mode** — the question pool and STAR heuristics are decoupled enough that a whiteboard or system design mode is a config swap
