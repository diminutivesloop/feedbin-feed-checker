import { blob } from "https://esm.town/v/std/blob/main.ts";

const FEEDBIN_BASE_URL = "https://api.feedbin.com/v2";
const CACHE_PREFIX = "feedbin-api:";
export const ENTRY_SAMPLE_SIZE = 10;
const calledPaths = new Set<string>();

interface CacheEntry<T> {
  etag?: string;
  lastModified?: string;
  body: T;
}

export type FeedbinSubscription = {
  id: number;
  feed_id: number;
  title: string | null;
  feed_url: string | null;
  site_url: string | null;
};

export type FeedbinEntry = {
  id: number;
  feed_id: number;
  published: string | null;
  created_at: string | null;
};

function requiredEnv(name: string): string {
  const denoEnv = Deno.env;
  const value = denoEnv.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function makeAuthHeader(user: string, password: string): string {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

function cacheKey(path: string): string {
  return `${CACHE_PREFIX}${path}`;
}

export async function pruneCache(): Promise<void> {
  const activeKeys = new Set([...calledPaths].map(cacheKey));
  const cachedEntries = await blob.list(CACHE_PREFIX);
  const staleEntries = cachedEntries.filter(({ key }) => !activeKeys.has(key));

  await Promise.all(staleEntries.map(({ key }) => blob.delete(key)));

  if (staleEntries.length > 0) {
    console.log(
      `[feedbin] pruned ${staleEntries.length} stale cache entries: ${staleEntries.map(({ key }) => key).join(", ")}`,
    );
  }
}

function withoutEntryContent(entries: FeedbinEntry[]): FeedbinEntry[] {
  return entries.map((entry) => {
    const { content: _content, ...cachedEntry } = entry as FeedbinEntry & {
      content?: unknown;
    };
    return cachedEntry;
  });
}

async function fetchFeedbinJson<T>(
  path: string,
  cacheBody: (body: T) => T = (body) => body,
): Promise<T> {
  calledPaths.add(path);
  const url = `${FEEDBIN_BASE_URL}${path}`;
  const username = requiredEnv("feedbin_user");
  const password = requiredEnv("feedbin_password");
  const cached = await blob.getJSON<CacheEntry<T>>(cacheKey(path));

  const conditionalHeaders: Record<string, string> = {};
  if (cached?.etag) {
    conditionalHeaders["If-None-Match"] = cached.etag;
  }
  if (cached?.lastModified) {
    conditionalHeaders["If-Modified-Since"] = cached.lastModified;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: makeAuthHeader(username, password),
      Accept: "application/json",
      ...conditionalHeaders,
    },
  });

  if (response.status === 304 && cached) {
    console.log(`[feedbin] 304 cache hit: ${path}`);
    return cached.body;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Feedbin request failed (${response.status}) ${url}: ${errorText.slice(0, 300)}`,
    );
  }

  const responseBody = await response.json() as T;
  await blob.setJSON(cacheKey(path), {
    etag: response.headers.get("ETag") ?? undefined,
    lastModified: response.headers.get("Last-Modified") ?? undefined,
    body: cacheBody(responseBody),
  });
  console.log(`[feedbin] 200 cached: ${path}`);

  return responseBody;
}

export async function getSubscriptions(): Promise<FeedbinSubscription[]> {
  return await fetchFeedbinJson<FeedbinSubscription[]>(
    "/subscriptions.json",
  );
}

export async function getFeedEntries(
  feedId: number,
  perPage: number,
): Promise<FeedbinEntry[]> {
  return await fetchFeedbinJson<FeedbinEntry[]>(
    `/feeds/${feedId}/entries.json?per_page=${perPage}&page=1`,
    withoutEntryContent,
  );
}