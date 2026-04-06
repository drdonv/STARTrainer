import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/getCurrentUserId";
import {
  clientIpFromHeaders,
  enterRealtimeSessionMintGate,
} from "@/lib/security/rateLimit";

const RATE_LIMIT_MESSAGE = "Too many requests. Please try again later.";
const SERVICE_UNAVAILABLE_MESSAGE =
  "Service temporarily unavailable. Please try again later.";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

function jsonNoStore(
  body: Record<string, unknown>,
  status: number,
  headersInit?: HeadersInit,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...(headersInit ?? {}),
    },
  });
}

function isSameOriginRequest(headerList: Headers): boolean {
  const fetchSite = headerList.get("sec-fetch-site");
  if (
    fetchSite &&
    fetchSite !== "same-origin" &&
    fetchSite !== "none"
  ) {
    return false;
  }

  const origin = headerList.get("origin");
  if (!origin) {
    return true;
  }

  const hostHeader = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!hostHeader) {
    return false;
  }
  const host = hostHeader.split(",")[0]?.trim().toLowerCase();
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host.toLowerCase() !== host) {
      return false;
    }

    const forwardedProto = headerList
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    if (forwardedProto && originUrl.protocol !== `${forwardedProto}:`) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasExpectedRequestHeader(headerList: Headers): boolean {
  const requestedWith = headerList.get("x-requested-with");
  return requestedWith === "XMLHttpRequest";
}

export async function POST() {
  const headerList = await headers();
  if (
    !isSameOriginRequest(headerList) ||
    !hasExpectedRequestHeader(headerList)
  ) {
    return jsonNoStore({ error: "Forbidden" }, 403);
  }

  const clientIp = clientIpFromHeaders(headerList);
  const clerkUserId = await getCurrentUserId();
  /** Rate-limit key: signed-in users get Clerk `userId`; anonymous visitors are scoped by IP. */
  const mintUserKey = clerkUserId ?? `anon:${clientIp}`;

  const gate = await enterRealtimeSessionMintGate(mintUserKey, clientIp);
  if (!gate.ok) {
    if (gate.misconfigured) {
      return jsonNoStore({ error: SERVICE_UNAVAILABLE_MESSAGE }, 503);
    }
    const retryAfter = gate.retryAfterSeconds ?? 60;
    return jsonNoStore(
      { error: RATE_LIMIT_MESSAGE },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Realtime session: upstream credentials not configured");
    return jsonNoStore({ error: SERVICE_UNAVAILABLE_MESSAGE }, 503);
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
      const redactedSnippet =
        errorData.length > 180 ? `${errorData.slice(0, 180)}...` : errorData;
      console.error("OpenAI client_secrets creation failed", {
        status: response.status,
        detail: redactedSnippet,
      });
      return jsonNoStore({ error: "Failed to create realtime session" }, 502);
    }

    const data: unknown = await response.json();
    if (!data || typeof data !== "object") {
      return jsonNoStore({ error: "Invalid session response" }, 502);
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
      return jsonNoStore({ error: "No client secret returned" }, 500);
    }
    return jsonNoStore({ token }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error creating realtime session", { message });
    return jsonNoStore({ error: "Internal server error" }, 500);
  } finally {
    await gate.release();
  }
}
