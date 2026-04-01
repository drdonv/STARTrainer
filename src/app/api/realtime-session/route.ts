import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: "gpt-4o-realtime-preview",
            instructions:
              "You are a real-time interview coach. Await further configuration via session.update.",
            output_modalities: ["text"],
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                noise_reduction: { type: "near_field" },
                transcription: {
                  model: "whisper-1",
                  language: "en",
                },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                  create_response: false,
                },
              },
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenAI client_secrets creation failed:", errorData);
      return NextResponse.json(
        { error: "Failed to create realtime session" },
        { status: response.status },
      );
    }

    const data: unknown = await response.json();
    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { error: "Invalid session response" },
        { status: 502 },
      );
    }
    const o = data as Record<string, unknown>;
    // GA API returns the secret at data.value (e.g. "ek_...")
    const raw =
      o.value ??
      (o.client_secret &&
      typeof o.client_secret === "object" &&
      o.client_secret !== null
        ? (o.client_secret as Record<string, unknown>).value
        : undefined);
    const token = typeof raw === "string" ? raw.trim() : "";
    if (!token || token.length > 4096) {
      console.error("No or invalid client secret in response");
      return NextResponse.json(
        { error: "No client secret returned" },
        { status: 500 },
      );
    }
    return NextResponse.json({ token });
  } catch (err) {
    console.error("Error creating realtime session:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
