import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk session middleware without forced sign-in. To require auth for token minting again:
 * import { createRouteMatcher } from "@clerk/nextjs/server";
 * const isProtectedRoute = createRouteMatcher(["/api/realtime-session(.*)"]);
 * export default clerkMiddleware(async (auth, req) => {
 *   if (isProtectedRoute(req)) await auth.protect();
 * });
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static assets; covers pages and /api (no tRPC in this app).
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
