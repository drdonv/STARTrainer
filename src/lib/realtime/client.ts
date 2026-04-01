import type { ClientEvent, ServerEvent } from "./events";

export type RealtimeEventHandler = (event: ServerEvent) => void;

const REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private readonly handlers: Map<string, Set<RealtimeEventHandler>> = new Map();
  private _isConnected = false;
  private _isSessionReady = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get isReady(): boolean {
    return this._isConnected && this._isSessionReady;
  }

  connect(ephemeralToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(REALTIME_URL, [
          "realtime",
          `openai-insecure-api-key.${ephemeralToken}`,
        ]);

        this.ws.onopen = () => {
          this._isConnected = true;
        };

        this.ws.onmessage = (event) => {
          try {
            const serverEvent = JSON.parse(event.data) as ServerEvent;
            this.dispatch(serverEvent);

            if (serverEvent.type === "session.created") {
              this._isSessionReady = true;
              resolve();
            }
          } catch {
            console.error("Failed to parse realtime event:", event.data);
          }
        };

        this.ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          if (!this._isSessionReady) {
            reject(new Error(`WebSocket connection failed: ${err.type}`));
          }
        };

        this.ws.onclose = (event) => {
          this._isConnected = false;
          this._isSessionReady = false;
          console.log("WebSocket closed:", event.code, event.reason);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this._isConnected = false;
      this._isSessionReady = false;
    }
  }

  on(eventType: string, handler: RealtimeEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)?.add(handler);
  }

  off(eventType: string, handler: RealtimeEventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  onAny(handler: RealtimeEventHandler): void {
    this.on("*", handler);
  }

  private dispatch(event: ServerEvent): void {
    this.handlers.get(event.type)?.forEach((h) => h(event));
    this.handlers.get("*")?.forEach((h) => h(event));
  }

  private send(event: ClientEvent): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not connected, dropping event:", event.type);
      return;
    }
    this.ws.send(JSON.stringify(event));
  }

  updateSession(config: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      const handler: RealtimeEventHandler = () => {
        this.off("session.updated", handler);
        resolve();
      };
      this.on("session.updated", handler);

      this.send({
        type: "session.update",
        session: config,
      });

      // Resolve after timeout in case the event doesn't fire
      setTimeout(() => {
        this.off("session.updated", handler);
        resolve();
      }, 3000);
    });
  }

  appendAudio(base64Audio: string): void {
    this.send({
      type: "input_audio_buffer.append",
      audio: base64Audio,
    });
  }

  commitAudioBuffer(): void {
    this.send({ type: "input_audio_buffer.commit" });
  }

  clearAudioBuffer(): void {
    this.send({ type: "input_audio_buffer.clear" });
  }

  requestResponse(instructions?: string): void {
    const event: ClientEvent = {
      type: "response.create",
      response: {
        output_modalities: ["text"],
        ...(instructions ? { instructions } : {}),
      },
    };
    this.send(event);
  }

  requestOutOfBandResponse(instructions: string): void {
    const event: ClientEvent = {
      type: "response.create",
      response: {
        output_modalities: ["text"],
        instructions,
        conversation: "none",
      },
    };
    this.send(event);
  }
}
