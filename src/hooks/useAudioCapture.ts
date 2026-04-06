"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { base64EncodeAudio, downsampleTo24kHz } from "@/lib/realtime/audio";

const BUFFER_SIZE = 4096;
const TARGET_SAMPLE_RATE = 24000;

interface UseAudioCaptureOptions {
  onAudioChunk: (base64Audio: string) => void;
}

export function useAudioCapture({ onAudioChunk }: UseAudioCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const onAudioChunkRef = useRef(onAudioChunk);

  useEffect(() => {
    onAudioChunkRef.current = onAudioChunk;
  }, [onAudioChunk]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: TARGET_SAMPLE_RATE,
        },
      });
      streamRef.current = stream;

      const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      contextRef.current = context;

      const source = context.createMediaStreamSource(stream);

      // ScriptProcessorNode is deprecated but widely supported and simpler
      // than AudioWorklet for an MVP. Swap to AudioWorklet if latency matters.
      const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const downsampled = downsampleTo24kHz(
          new Float32Array(inputData),
          context.sampleRate
        );
        const base64 = base64EncodeAudio(downsampled);
        onAudioChunkRef.current(base64);
      };

      source.connect(processor);
      processor.connect(context.destination);
      setIsCapturing(true);
    } catch (err) {
      console.error("Failed to capture audio:", err);
      throw err;
    }
  }, []);

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    contextRef.current?.close();
    contextRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setIsCapturing(false);
  }, []);

  return { isCapturing, start, stop };
}
