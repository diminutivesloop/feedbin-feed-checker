const FEEDBIN_BASE_URL = "https://api.feedbin.com/v2";
export const ENTRY_SAMPLE_SIZE = 10;

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

async function fetchFeedbinJson<T>(
  path: string,
): Promise<T> {
  const url = `${FEEDBIN_BASE_URL}${path}`;
  const username = requiredEnv("feedbin_user");
  const password = requiredEnv("feedbin_password");

  const response = await fetch(url, {
    headers: {
      Authorization: makeAuthHeader(username, password),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Feedbin request failed (${response.status}) ${url}: ${errorText.slice(0, 300)}`,
    );
  }

  return await response.json() as T;
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
  );
}