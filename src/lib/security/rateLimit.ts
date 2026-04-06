import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** Per authenticated user, sliding 1 minute (billing burst control). */
const USER_MINUTE_WINDOW = "1 m";
const USER_MINUTE_MAX = 10;

/** Per client IP — shared egress / NAT; higher ceiling than per-user minute. */
const IP_MINUTE_WINDOW = "1 m";
const IP_MINUTE_MAX = 80;

/** Per IP rolling 24h — curbs many distinct accounts from one host/NAT. */
const IP_DAY_WINDOW = "24 h";
const IP_DAY_MAX = 600;

/** Per user rolling 24h (daily spend cap). */
const USER_DAY_WINDOW = "24 h";
const USER_DAY_MAX = 150;

/** Prevents overlapping mints for one user (abuse + duplicate session churn). */
const MINT_LOCK_KEY_PREFIX = "realtime-mint-lock";
const MINT_LOCK_TTL_SEC = 90;

const LOCAL_USER_MINUTE_MS = 60_000;
const LOCAL_USER_MINUTE_MAX = 8;
const LOCAL_IP_MINUTE_MS = 60_000;
const LOCAL_IP_MINUTE_MAX = 60;
const LOCAL_IP_DAY_MS = 86_400_000;
const LOCAL_IP_DAY_MAX = 500;
const LOCAL_DAY_MS = 86_400_000;
const LOCAL_DAY_MAX = 120;

type LocalBucket = { count: number; reset: number };

const localUserMinute = new Map<string, LocalBucket>();
const localIpMinute = new Map<string, LocalBucket>();
const localIpDay = new Map<string, LocalBucket>();
const localUserDay = new Map<string, LocalBucket>();
const localMintLocks = new Map<string, number>();

/** Full scans of local maps at most this often unless a soft cap forces a pass. */
const LOCAL_PRUNE_INTERVAL_MS = 30_000;
/** If any local map grows past this, prune expired entries on the next local gate touch. */
const LOCAL_MAP_SOFT_CAP = 4096;

let lastLocalPruneAt = 0;

function pruneExpiredLocalBuckets(map: Map<string, LocalBucket>, now: number) {
  for (const [key, bucket] of map) {
    if (bucket.reset <= now) {
      map.delete(key);
    }
  }
}

function pruneExpiredLocalMintLocks(now: number) {
  for (const [userId, until] of localMintLocks) {
    if (until <= now) {
      localMintLocks.delete(userId);
    }
  }
}

function localMapsOverSoftCap(): boolean {
  return (
    localUserMinute.size > LOCAL_MAP_SOFT_CAP ||
    localIpMinute.size > LOCAL_MAP_SOFT_CAP ||
    localIpDay.size > LOCAL_MAP_SOFT_CAP ||
    localUserDay.size > LOCAL_MAP_SOFT_CAP ||
    localMintLocks.size > LOCAL_MAP_SOFT_CAP
  );
}

function maybePruneLocalState(now: number) {
  const intervalElapsed = now - lastLocalPruneAt >= LOCAL_PRUNE_INTERVAL_MS;
  if (!intervalElapsed && !localMapsOverSoftCap()) {
    return;
  }
  lastLocalPruneAt = now;
  pruneExpiredLocalBuckets(localUserMinute, now);
  pruneExpiredLocalBuckets(localIpMinute, now);
  pruneExpiredLocalBuckets(localIpDay, now);
  pruneExpiredLocalBuckets(localUserDay, now);
  pruneExpiredLocalMintLocks(now);
}

export type MintGateResult =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; misconfigured?: true; retryAfterSeconds?: number };

function touchLocalBucket(
  map: Map<string, LocalBucket>,
  key: string,
  windowMs: number,
  max: number,
): { success: boolean; reset: number } {
  const now = Date.now();
  const existing = map.get(key);
  if (!existing || existing.reset <= now) {
    const reset = now + windowMs;
    map.set(key, { count: 1, reset });
    return { success: true, reset };
  }
  existing.count += 1;
  map.set(key, existing);
  return {
    success: existing.count <= max,
    reset: existing.reset,
  };
}

function tryLocalMintLock(userId: string): boolean {
  const now = Date.now();
  maybePruneLocalState(now);
  const until = localMintLocks.get(userId);
  if (until !== undefined && until > now) {
    return false;
  }
  localMintLocks.set(userId, now + MINT_LOCK_TTL_SEC * 1000);
  return true;
}

function releaseLocalMintLock(userId: string) {
  localMintLocks.delete(userId);
}

let redisSingleton: Redis | null | undefined;

function upstashEnvConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return Boolean(url && token);
}

function getRedis(): Redis | null {
  if (redisSingleton !== undefined) {
    return redisSingleton;
  }
  if (!upstashEnvConfigured()) {
    redisSingleton = null;
    return redisSingleton;
  }
  try {
    redisSingleton = Redis.fromEnv();
    return redisSingleton;
  } catch {
    redisSingleton = null;
    return redisSingleton;
  }
}

let userMinuteLimiter: Ratelimit | undefined;
let ipMinuteLimiter: Ratelimit | undefined;
let ipDayLimiter: Ratelimit | undefined;
let userDayLimiter: Ratelimit | undefined;

function getUserMinuteLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (userMinuteLimiter === undefined) {
    userMinuteLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(USER_MINUTE_MAX, USER_MINUTE_WINDOW),
      analytics: false,
      prefix: "realtime-session:user:min",
    });
  }
  return userMinuteLimiter;
}

function getIpMinuteLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (ipMinuteLimiter === undefined) {
    ipMinuteLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(IP_MINUTE_MAX, IP_MINUTE_WINDOW),
      analytics: false,
      prefix: "realtime-session:ip:min",
    });
  }
  return ipMinuteLimiter;
}

function getIpDayLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (ipDayLimiter === undefined) {
    ipDayLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(IP_DAY_MAX, IP_DAY_WINDOW),
      analytics: false,
      prefix: "realtime-session:ip:day",
    });
  }
  return ipDayLimiter;
}

function getUserDayLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (userDayLimiter === undefined) {
    userDayLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(USER_DAY_MAX, USER_DAY_WINDOW),
      analytics: false,
      prefix: "realtime-session:user:day",
    });
  }
  return userDayLimiter;
}

function retrySecondsFromReset(resetMs: number): number {
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

function enforceLocalMintLimits(
  userId: string,
  clientIp: string,
): MintGateResult | null {
  const now = Date.now();
  maybePruneLocalState(now);
  const u = touchLocalBucket(localUserMinute, `user:${userId}`, LOCAL_USER_MINUTE_MS, LOCAL_USER_MINUTE_MAX);
  if (!u.success) {
    return { ok: false, retryAfterSeconds: retrySecondsFromReset(u.reset) };
  }
  const ipKey = `ip:${clientIp}`;
  const i = touchLocalBucket(localIpMinute, ipKey, LOCAL_IP_MINUTE_MS, LOCAL_IP_MINUTE_MAX);
  if (!i.success) {
    return { ok: false, retryAfterSeconds: retrySecondsFromReset(i.reset) };
  }
  const id = touchLocalBucket(localIpDay, `${ipKey}:day`, LOCAL_IP_DAY_MS, LOCAL_IP_DAY_MAX);
  if (!id.success) {
    return { ok: false, retryAfterSeconds: retrySecondsFromReset(id.reset) };
  }
  const d = touchLocalBucket(localUserDay, `user:${userId}:day`, LOCAL_DAY_MS, LOCAL_DAY_MAX);
  if (!d.success) {
    return { ok: false, retryAfterSeconds: retrySecondsFromReset(d.reset) };
  }
  if (!tryLocalMintLock(userId)) {
    return { ok: false, retryAfterSeconds: MINT_LOCK_TTL_SEC };
  }
  return null;
}

/**
 * Best-effort client IP for rate limiting. Prefer trusted proxy headers on your host
 * (e.g. Vercel sets x-forwarded-for). Without them, many users may share the "unknown" bucket in dev.
 */
export function clientIpFromHeaders(headerList: Headers): string {
  const vercelForwarded = headerList.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const first = vercelForwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 256);
  }

  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 256);
  }
  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 256);
  return "unknown";
}

/**
 * Enforces per-user minute, per-IP minute, per-user daily, per-IP daily caps (Upstash in prod),
 * and a per-user mint lock released by `release()` after the handler finishes.
 * Responses should stay generic; do not disclose which limit fired.
 */
export async function enterRealtimeSessionMintGate(
  userId: string,
  clientIp: string,
): Promise<MintGateResult> {
  const redis = getRedis();

  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, misconfigured: true };
    }
    const local = enforceLocalMintLimits(userId, clientIp);
    if (local) return local;
    return {
      ok: true,
      release: async () => {
        releaseLocalMintLock(userId);
      },
    };
  }

  const userMin = getUserMinuteLimiter();
  const ipMin = getIpMinuteLimiter();
  const ipDay = getIpDayLimiter();
  const userDay = getUserDayLimiter();
  if (!userMin || !ipMin || !ipDay || !userDay) {
    return { ok: false, misconfigured: true };
  }

  const [ur, ir, idr, dr] = await Promise.all([
    userMin.limit(userId),
    ipMin.limit(clientIp),
    ipDay.limit(clientIp),
    userDay.limit(userId),
  ]);

  if (!ur.success) {
    return { ok: false, retryAfterSeconds: retrySecondsFromReset(ur.reset) };
  }
  if (!ir.success) {
    return { ok: false, retryAfterSeconds: retrySecondsFromReset(ir.reset) };
  }
  if (!idr.success) {
    return { ok: false, retryAfterSeconds: retrySecondsFromReset(idr.reset) };
  }
  if (!dr.success) {
    return { ok: false, retryAfterSeconds: retrySecondsFromReset(dr.reset) };
  }

  const lockKey = `${MINT_LOCK_KEY_PREFIX}:${userId}`;
  const acquired = await redis.set(lockKey, "1", { nx: true, ex: MINT_LOCK_TTL_SEC });
  if (acquired !== "OK") {
    return { ok: false, retryAfterSeconds: MINT_LOCK_TTL_SEC };
  }

  return {
    ok: true,
    release: async () => {
      try {
        await redis.del(lockKey);
      } catch {
        // Lock still expires via TTL; avoid throwing from release.
      }
    },
  };
}
