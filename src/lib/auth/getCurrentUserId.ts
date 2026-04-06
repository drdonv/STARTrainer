import { auth } from "@clerk/nextjs/server";

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session.userId ?? null;
}
