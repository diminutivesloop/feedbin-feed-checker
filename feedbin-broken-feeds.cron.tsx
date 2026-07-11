const THRESHOLD_MULTIPLIER = 3;

import {
  ENTRY_SAMPLE_SIZE,
  type FeedbinEntry, getFeedEntries,
  getSubscriptions
} from "./feedbin.ts";

type FlaggedFeed = {
  title: string;
  sitelink?: string;
  feedLink?: string;
  latestPublishedIso: string;
  latestPublishedRelative: string;
  meanIntervalDays: number;
  currentGapDays: number;
  thresholdDays: number;
  ratio: number;
};

function parseEntryTimestampMs(entry: FeedbinEntry): number | null {
  const candidate = entry.published ?? entry.created_at;
  if (!candidate) {
    return null;
  }

  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatCompactRelative(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(safeMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo`;
  }

  const years = Math.floor(days / 365);
  return `${years}y`;
}

function daysFromMs(ms: number): number {
  return ms / (1000 * 60 * 60 * 24);
}

export default async function () {
  const startedAt = new Date();
  const nowMs = Date.now();

  const subscriptions = await getSubscriptions();

  const flaggedFeeds: FlaggedFeed[] = [];
  const skipReasons: string[] = [];

  let i = 0
  for (const subscription of subscriptions) {
    i++
    console.log(`Checking feed ${subscription.feed_id} (${subscription.title}) ${i}/${subscriptions.length}...`);
    try {
      const entries = await getFeedEntries(
        subscription.feed_id,
        ENTRY_SAMPLE_SIZE,
      );

      const timestamps = entries
        .map(parseEntryTimestampMs)
        .filter((ts): ts is number => ts !== null)
        .sort((a, b) => b - a);

      if (timestamps.length < 2) {
        skipReasons.push(`${subscription.feed_id}:insufficient_entries`);
        continue;
      }

      const latestPublishedMs = timestamps[0];
      const intervalsMs: number[] = [];

      for (let i = 0; i < timestamps.length - 1; i += 1) {
        const interval = timestamps[i] - timestamps[i + 1];
        if (interval > 0) {
          intervalsMs.push(interval);
        }
      }

      if (intervalsMs.length === 0) {
        skipReasons.push(`${subscription.feed_id}:non_positive_intervals`);
        continue;
      }

      const meanIntervalMs = mean(intervalsMs);
      if (meanIntervalMs <= 0) {
        skipReasons.push(`${subscription.feed_id}:invalid_mean_interval`);
        continue;
      }

      const currentGapMs = nowMs - latestPublishedMs;
      const thresholdMs = meanIntervalMs * THRESHOLD_MULTIPLIER;

      if (currentGapMs > thresholdMs) {
        const title = subscription.title?.trim() || `Feed ${subscription.feed_id}`;
        flaggedFeeds.push({
          title,
          sitelink: subscription.site_url ?? undefined,
          feedLink: subscription.feed_url ?? undefined,
          latestPublishedIso: new Date(latestPublishedMs).toISOString(),
          latestPublishedRelative: formatCompactRelative(currentGapMs),
          meanIntervalDays: daysFromMs(meanIntervalMs),
          currentGapDays: daysFromMs(currentGapMs),
          thresholdDays: daysFromMs(thresholdMs),
          ratio: currentGapMs / meanIntervalMs,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipReasons.push(`${subscription.feed_id}:fetch_or_parse_error:${message}`);
    }
  }

  flaggedFeeds.sort((a, b) => b.ratio - a.ratio);

  console.log("Feedbin Potentially Broken Feed Check");
  console.log(`Run timestamp: ${startedAt.toISOString()}`);
  console.log(`Subscriptions checked: ${subscriptions.length}`);
  console.log(`Potentially broken feeds: ${flaggedFeeds.length}`);
  console.log(`Skipped subscriptions: ${skipReasons.length}`);
  console.log("");

  if (flaggedFeeds.length === 0) {
    console.log("No potentially broken feeds detected.");
  } else {
    console.log("Potentially broken feeds:");
    for (const [index, feed] of flaggedFeeds.entries()) {
      console.log(`${index + 1}. ${feed.title}`);
      if (feed.sitelink) {
        console.log(`   Site: ${feed.sitelink}`);
      }
      if (feed.feedLink) {
        console.log(`   Feed: ${feed.feedLink}`);
      }
      console.log(
        `   Latest published: ${feed.latestPublishedIso} (${feed.latestPublishedRelative} ago)`,
      );
      console.log(
        `   Gap: ${feed.currentGapDays.toFixed(2)}d | Mean interval: ${feed.meanIntervalDays.toFixed(2)}d | Threshold (x${THRESHOLD_MULTIPLIER}): ${feed.thresholdDays.toFixed(2)}d`,
      );
    }
  }

  if (skipReasons.length > 0) {
    console.log("");
    console.log("Skipped details:");
    for (const reason of skipReasons) {
      console.log(`- ${reason}`);
    }
  }
}
