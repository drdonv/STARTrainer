export interface SessionUpdateEvent {
  type: "session.update";
  session: Record<string, unknown>;
}

export interface InputAudioBufferAppendEvent {
  type: "input_audio_buffer.append";
  audio: string;
}

export interface InputAudioBufferCommitEvent {
  type: "input_audio_buffer.commit";
}

export interface InputAudioBufferClearEvent {
  type: "input_audio_buffer.clear";
}

export interface ResponseCreateEvent {
  type: "response.create";
  response?: {
    output_modalities?: string[];
    instructions?: string;
    conversation?: string;
  };
}

export type ClientEvent =
  | SessionUpdateEvent
  | InputAudioBufferAppendEvent
  | InputAudioBufferCommitEvent
  | InputAudioBufferClearEvent
  | ResponseCreateEvent;

export interface SessionCreatedServerEvent {
  type: "session.created";
  session: Record<string, unknown>;
}

export interface SessionUpdatedServerEvent {
  type: "session.updated";
  session: Record<string, unknown>;
}

export interface InputAudioBufferSpeechStartedEvent {
  type: "input_audio_buffer.speech_started";
  audio_start_ms: number;
  item_id: string;
}

export interface InputAudioBufferSpeechStoppedEvent {
  type: "input_audio_buffer.speech_stopped";
  audio_end_ms: number;
  item_id: string;
}

export interface InputAudioBufferCommittedEvent {
  type: "input_audio_buffer.committed";
  item_id: string;
  previous_item_id: string | null;
}

export interface TranscriptionDeltaEvent {
  type: "conversation.item.input_audio_transcription.delta";
  item_id: string;
  content_index: number;
  delta: string;
}

export interface TranscriptionCompletedEvent {
  type: "conversation.item.input_audio_transcription.completed";
  item_id: string;
  content_index: number;
  transcript: string;
}

export interface ResponseOutputTextDeltaEvent {
  type: "response.output_text.delta";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseOutputTextDoneEvent {
  type: "response.output_text.done";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  text: string;
}

export interface ResponseDoneEvent {
  type: "response.done";
  response: {
    id: string;
    status: string;
    output: Array<{
      type: string;
      role: string;
      content: Array<{
        type: string;
        text?: string;
      }>;
    }>;
  };
}

export interface ErrorEvent {
  type: "error";
  error?: {
    type?: string;
    code?: string | null;
    message?: string;
    param?: string | null;
  };
}

function nestedApiErrorLine(err: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof err.message === "string" && err.message) parts.push(err.message);
  if (typeof err.code === "string" && err.code) parts.push(`code=${err.code}`);
  if (typeof err.type === "string" && err.type) parts.push(`type=${err.type}`);
  return parts.length ? parts.join(" | ") : null;
}

/** Readable line + JSON fallback so DevTools does not show `{}` for API errors. */
export function formatRealtimeErrorEvent(event: unknown): string {
  if (event === null) return "null";
  if (event === undefined) return "undefined";
  if (typeof event === "string") return event;
  if (
    typeof event === "number" ||
    typeof event === "boolean" ||
    typeof event === "bigint"
  ) {
    return String(event);
  }
  if (typeof event === "symbol") return event.toString();
  if (typeof event === "function") return "function";
  const o = event as Record<string, unknown>;
  if (o.type === "error" && o.error && typeof o.error === "object") {
    const line = nestedApiErrorLine(o.error as Record<string, unknown>);
    if (line) return line;
  }
  try {
    return JSON.stringify(event);
  } catch {
    return "Unknown realtime error";
  }
}

export type ServerEvent =
  | SessionCreatedServerEvent
  | SessionUpdatedServerEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | InputAudioBufferCommittedEvent
  | TranscriptionDeltaEvent
  | TranscriptionCompletedEvent
  | ResponseOutputTextDeltaEvent
  | ResponseOutputTextDoneEvent
  | ResponseDoneEvent
  | ErrorEvent;
