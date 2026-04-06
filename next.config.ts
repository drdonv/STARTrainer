import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Document-level CSP for Clerk + OpenAI Realtime (browser WebSocket) + Next.js.
 * - Clerk: https://clerk.com/docs/security/clerk-csp (manual baseline; FAPI hosts vary by instance — *.clerk.accounts.dev covers the common case).
 * - OpenAI: browser connects to wss://api.openai.com (see src/lib/realtime/client.ts).
 * - Next.js App Router: 'unsafe-inline' scripts often required unless you adopt nonce + strict-dynamic in middleware (see Clerk docs).
 * - 'unsafe-eval': Next dev tooling; omitted in production.
 * If Clerk uses a custom Frontend API domain, add it to script-src and connect-src.
 */
function contentSecurityPolicy(): string {
  const scriptEval = isDev ? " 'unsafe-eval'" : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${scriptEval} https://*.clerk.accounts.dev https://*.clerk.com https://clerk.com https://challenges.cloudflare.com`,
    "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com wss://*.clerk.accounts.dev wss://*.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com wss://api.openai.com https://api.openai.com",
    "img-src 'self' data: blob: https://img.clerk.com",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "frame-src 'self' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

/**
 * Feature gates for sensitive APIs: mic only on this origin (voice coach); block camera,
 * geolocation, and payment surfaces by default. Reduces impact of XSS/third-party iframes.
 */
const permissionsPolicy =
  "camera=(), geolocation=(), microphone=(self), payment=(), usb=()";

const nextConfig: NextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: permissionsPolicy },
      {
        key: "Content-Security-Policy",
        value: contentSecurityPolicy(),
      },
    ];
    if (!isDev) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
