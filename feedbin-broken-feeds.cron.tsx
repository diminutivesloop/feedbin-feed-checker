const THRESHOLD_MULTIPLIER = 4;
const PREVIOUS_FEED_IDS_BLOB_KEY = "previous-report:flagged-feed-ids";

import { blob } from "https://esm.town/v/std/blob/main.ts";
import { email } from "https://esm.town/v/std/email";
import { escape } from "jsr:@std/html@1.0.5/entities";
import {
  ENTRY_SAMPLE_SIZE, getFeedEntries, getSubscriptions, pruneCache,
  type FeedbinEntry,
} from "./feedbin.ts";
import {
  daysFromMs,
  formatDuration,
  formatHumanDate,
} from "./formatting.ts";

export type FlaggedFeed = {
  feedId: number;
  title: string;
  sitelink?: string;
  feedLink?: string;
  faviconUrl?: string;
  latestPublishedDate: string;
  latestPublishedRelative: string;
  publishFrequency: string;
  meanIntervalDays: number;
  currentGapDays: number;
  thresholdDays: number;
  ratio: number;
  isNew?: boolean;
};

export function parseEntryTimestampMs(entry: FeedbinEntry): number | null {
  const candidate = entry.published ?? entry.created_at;
  if (!candidate) {
    return null;
  }

  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getFaviconUrl(siteUrl?: string): string | undefined {
  if (!siteUrl) {
    return undefined;
  }

  try {
    const hostname = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?sz=16&domain_url=${hostname}`;
  } catch {
    return undefined;
  }
}

export function buildEmailHtml(flaggedFeeds: FlaggedFeed[]): string {
  if (flaggedFeeds.length === 0) {
    return "<p>No potentially broken feeds detected.</p>";
  }

  const items = flaggedFeeds.map((feed) => {
    const faviconImg = feed.faviconUrl
      ? `<img src="${feed.faviconUrl}" alt="" width="16" height="16" style="vertical-align:middle;margin-right:6px;" />`
      : "";
    const titleHtml = `${faviconImg}${escape(feed.title)}`;
    const newBadge = feed.isNew
      ? ` <span style="background-color:#2da44e;color:#ffffff;font-size:11px;font-weight:bold;padding:1px 6px;border-radius:10px;vertical-align:middle;">NEW</span>`
      : "";
    const lines: string[] = [
      `<strong>${feed.feedLink ? `<a href="${feed.feedLink}">${titleHtml}</a>` : titleHtml}</strong>${newBadge}`,
    ];

    const links: string[] = [];
    if (feed.sitelink) {
      links.push(`<a href="${feed.sitelink}">Site</a>`);
    }
    if (feed.feedLink) {
      const subscriptionsUrl = `https://feedbin.com/settings/subscriptions?q=${encodeURIComponent(feed.feedLink)}`;
      links.push(`<a href="${subscriptionsUrl}">Feedbin subscription</a>`);
    }
    if (links.length > 0) {
      lines.push(links.join(" · "));
    }

    lines.push(
      `Latest published: ${feed.latestPublishedDate} (${feed.latestPublishedRelative} ago)`,
    );
    lines.push(`Usually publishes every ${feed.publishFrequency}`);

    return `<li>${lines.join("<br>")}</li>`;
  });

  return `<ol>${items.join("")}</ol>`;
}

export default async function (sendEmail = true) {
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
        skipReasons.push(`${subscription.feed_id} (${subscription.title}):insufficient_entries`);
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
        skipReasons.push(`${subscription.feed_id} (${subscription.title}):non_positive_intervals`);
        continue;
      }

      const meanIntervalMs = mean(intervalsMs);
      if (meanIntervalMs <= 0) {
        skipReasons.push(`${subscription.feed_id} (${subscription.title}):invalid_mean_interval`);
        continue;
      }

      const currentGapMs = nowMs - latestPublishedMs;
      const thresholdMs = meanIntervalMs * THRESHOLD_MULTIPLIER;

      if (currentGapMs > thresholdMs) {
        const title = subscription.title?.trim() || `Feed ${subscription.feed_id}`;
        flaggedFeeds.push({
          feedId: subscription.feed_id,
          title,
          sitelink: subscription.site_url ?? undefined,
          feedLink: subscription.feed_url ?? undefined,
          faviconUrl: getFaviconUrl(subscription.site_url ?? undefined),
          latestPublishedDate: formatHumanDate(latestPublishedMs),
          latestPublishedRelative: formatDuration(currentGapMs, true),
          publishFrequency: formatDuration(meanIntervalMs, false),
          meanIntervalDays: daysFromMs(meanIntervalMs),
          currentGapDays: daysFromMs(currentGapMs),
          thresholdDays: daysFromMs(thresholdMs),
          ratio: currentGapMs / meanIntervalMs,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipReasons.push(`${subscription.feed_id} (${subscription.title}):fetch_or_parse_error:${message}`);
    }
  }

  await pruneCache();

  flaggedFeeds.sort((a, b) => a.ratio - b.ratio);

  const previousFeedIds = new Set(
    await blob.getJSON<number[]>(PREVIOUS_FEED_IDS_BLOB_KEY) ?? [],
  );
  for (const feed of flaggedFeeds) {
    feed.isNew = !previousFeedIds.has(feed.feedId);
  }
  await blob.setJSON(
    PREVIOUS_FEED_IDS_BLOB_KEY,
    flaggedFeeds.map((feed) => feed.feedId),
  );
  const newFeedCount = flaggedFeeds.filter((feed) => feed.isNew).length;

  console.log("Feedbin Potentially Broken Feed Check");
  console.log(`Run timestamp: ${startedAt.toISOString()}`);
  console.log(`Subscriptions checked: ${subscriptions.length}`);
  console.log(`Potentially broken feeds: ${flaggedFeeds.length}`);
  console.log(`New since previous report: ${newFeedCount}`);
  console.log(`Skipped subscriptions: ${skipReasons.length}`);
  console.log("");

  if (flaggedFeeds.length === 0) {
    console.log("No potentially broken feeds detected.");
  } else {
    console.log("Potentially broken feeds:");
    for (const [index, feed] of flaggedFeeds.entries()) {
      console.log(`${index + 1}. ${feed.title}${feed.isNew ? " [NEW]" : ""}`);
      if (feed.sitelink) {
        console.log(`   Site: ${feed.sitelink}`);
      }
      if (feed.feedLink) {
        console.log(`   Feed: ${feed.feedLink}`);
        console.log(
          `   Feedbin subscriptions: https://feedbin.com/settings/subscriptions?q=${encodeURIComponent(feed.feedLink)}`,
        );
      }
      console.log(
        `   Latest published: ${feed.latestPublishedDate} (${feed.latestPublishedRelative} ago)`,
      );
      console.log(`   Usually publishes every ${feed.publishFrequency}`);
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

  if (sendEmail) {
    await email({
      subject: `Feedbin Broken Feed Check (${flaggedFeeds.length})`,
      html: buildEmailHtml(flaggedFeeds),
    });
  }
}
