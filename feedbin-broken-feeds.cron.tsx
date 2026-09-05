const THRESHOLD_MULTIPLIER = 4;

import { email } from "https://esm.town/v/std/email";
import { escape } from "jsr:@std/html@1.0.5/entities";
import {
  ENTRY_SAMPLE_SIZE,
  type FeedbinEntry, getFeedEntries,
  getSubscriptions
} from "./feedbin.ts";

export type FlaggedFeed = {
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

export function formatCompactRelative(ms: number): string {
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

function getDurationParts(ms: number) {
  const safeMs = Math.max(0, ms);
  const seconds = safeMs / 1000;

  if (seconds < 60) {
    return { value: Math.round(seconds), unit: "second" };
  }

  const minutes = seconds / 60;
  if (minutes < 60) {
    return { value: Math.round(minutes), unit: "minute" };
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return { value: Math.round(hours), unit: "hour" };
  }

  const days = hours / 24;
  if (days < 7) {
    return { value: Math.round(days), unit: "day" };
  }

  const weeks = days / 7;
  if (weeks < 5) {
    return { value: Math.round(weeks), unit: "week" };
  }

  const months = days / 30;
  if (months < 12) {
    return { value: Math.round(months), unit: "month" };
  }

  const years = days / 365;
  return { value: Math.round(years), unit: "year" };
}

export function daysFromMs(ms: number): number {
  return ms / (1000 * 60 * 60 * 24);
}

export function formatHumanDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function pluralize(value: number, unit: string): string {
  const rounded = Math.round(value);
  return `${rounded} ${unit}${rounded === 1 ? "" : "s"}`;
}

export function formatDuration(ms: number, compact: boolean = false): string {
  const parts = getDurationParts(ms);

  if (compact) {
    const unitMap: Record<string, string> = {
      second: "s",
      minute: "m",
      hour: "h",
      day: "d",
      week: "w",
      month: "mo",
      year: "y",
    };
    return `${parts.value}${unitMap[parts.unit]}`;
  } else {
    return pluralize(parts.value, parts.unit);
  }
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
    const lines: string[] = [
      `<strong>${feed.feedLink ? `<a href="${feed.feedLink}">${titleHtml}</a>` : titleHtml}</strong>`,
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
