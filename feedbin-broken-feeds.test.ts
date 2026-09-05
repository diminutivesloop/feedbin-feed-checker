import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  buildEmailHtml,
  daysFromMs,
  formatDuration,
  formatHumanDate,
  getFaviconUrl,
  mean,
  parseEntryTimestampMs,
  pluralize,
  type FlaggedFeed,
} from "./feedbin-broken-feeds.cron.tsx";

Deno.test("parseEntryTimestampMs prefers published over created_at", () => {
  const ms = parseEntryTimestampMs({
    id: 1,
    feed_id: 1,
    published: "2024-01-02T00:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
  });
  assertEquals(ms, Date.parse("2024-01-02T00:00:00Z"));
});

Deno.test("parseEntryTimestampMs falls back to created_at", () => {
  const ms = parseEntryTimestampMs({
    id: 1,
    feed_id: 1,
    published: null,
    created_at: "2024-01-01T00:00:00Z",
  });
  assertEquals(ms, Date.parse("2024-01-01T00:00:00Z"));
});

Deno.test("parseEntryTimestampMs returns null when no dates present", () => {
  const ms = parseEntryTimestampMs({
    id: 1,
    feed_id: 1,
    published: null,
    created_at: null,
  });
  assertEquals(ms, null);
});

Deno.test("parseEntryTimestampMs returns null for unparseable dates", () => {
  const ms = parseEntryTimestampMs({
    id: 1,
    feed_id: 1,
    published: "not-a-date",
    created_at: null,
  });
  assertEquals(ms, null);
});

Deno.test("mean returns 0 for empty array", () => {
  assertEquals(mean([]), 0);
});

Deno.test("mean computes average of values", () => {
  assertEquals(mean([1, 2, 3, 4]), 2.5);
});

Deno.test("formatDuration formats seconds", () => {
  assertEquals(formatDuration(30 * 1000, false), "30 seconds");
});

Deno.test("formatDuration formats singular minute", () => {
  assertEquals(formatDuration(60 * 1000, false), "1 minute");
});

Deno.test("formatDuration formats days", () => {
  assertEquals(formatDuration(3 * 24 * 60 * 60 * 1000, false), "3 days");
});

Deno.test("formatDuration formats weeks", () => {
  assertEquals(formatDuration(14 * 24 * 60 * 60 * 1000, false), "2 weeks");
});

Deno.test("formatDuration formats months", () => {
  assertEquals(formatDuration(60 * 24 * 60 * 60 * 1000, false), "2 months");
});

Deno.test("formatDuration formats years", () => {
  assertEquals(formatDuration(400 * 24 * 60 * 60 * 1000, false), "1 year");
});

Deno.test("formatDuration rounds up fractional days", () => {
  assertEquals(formatDuration(1.6 * 24 * 60 * 60 * 1000, false), "2 days");
});

Deno.test("formatDuration rounds down fractional days", () => {
  assertEquals(formatDuration(1.4 * 24 * 60 * 60 * 1000, false), "1 day");
});

Deno.test("formatDuration compact formats seconds", () => {
  assertEquals(formatDuration(30 * 1000, true), "30s");
});

Deno.test("formatDuration compact formats minutes", () => {
  assertEquals(formatDuration(5 * 60 * 1000, true), "5m");
});

Deno.test("formatDuration compact formats hours", () => {
  assertEquals(formatDuration(3 * 60 * 60 * 1000, true), "3h");
});

Deno.test("formatDuration compact formats days", () => {
  assertEquals(formatDuration(2 * 24 * 60 * 60 * 1000, true), "2d");
});

Deno.test("formatDuration compact formats weeks", () => {
  assertEquals(formatDuration(14 * 24 * 60 * 60 * 1000, true), "2w");
});

Deno.test("formatDuration compact formats months", () => {
  assertEquals(formatDuration(60 * 24 * 60 * 60 * 1000, true), "2mo");
});

Deno.test("formatDuration compact formats years", () => {
  assertEquals(formatDuration(400 * 24 * 60 * 60 * 1000, true), "1y");
});

Deno.test("formatDuration compact rounds up fractional hours", () => {
  assertEquals(formatDuration(1.6 * 60 * 60 * 1000, true), "2h");
});

Deno.test("formatDuration compact rounds down fractional hours", () => {
  assertEquals(formatDuration(1.4 * 60 * 60 * 1000, true), "1h");
});


Deno.test("daysFromMs converts milliseconds to days", () => {
  assertEquals(daysFromMs(2 * 24 * 60 * 60 * 1000), 2);
});

Deno.test("formatHumanDate formats a date without time", () => {
  const ms = Date.UTC(2026, 7, 27, 15, 30);
  const formatted = formatHumanDate(ms);
  assertStringIncludes(formatted, "2026");
  assertStringIncludes(formatted, "August");
});

Deno.test("pluralize singular", () => {
  assertEquals(pluralize(1, "day"), "1 day");
});

Deno.test("pluralize plural", () => {
  assertEquals(pluralize(2, "day"), "2 days");
});

Deno.test("pluralize rounds fractional values", () => {
  assertEquals(pluralize(1.6, "week"), "2 weeks");
});

Deno.test("getFaviconUrl builds a url from a valid site url", () => {
  const url = getFaviconUrl("https://example.com/blog");
  assertEquals(
    url,
    "https://www.google.com/s2/favicons?sz=16&domain_url=example.com",
  );
});

Deno.test("getFaviconUrl returns undefined for missing site url", () => {
  assertEquals(getFaviconUrl(undefined), undefined);
});

Deno.test("getFaviconUrl returns undefined for invalid site url", () => {
  assertEquals(getFaviconUrl("not-a-url"), undefined);
});

Deno.test("buildEmailHtml returns a message when there are no flagged feeds", () => {
  const html = buildEmailHtml([]);
  assertStringIncludes(html, "No potentially broken feeds detected.");
});

Deno.test("buildEmailHtml renders feed details with escaped title and links", () => {
  const feeds: FlaggedFeed[] = [
    {
      title: "<Broken> & Feed",
      sitelink: "https://example.com",
      feedLink: "https://example.com/rss.xml",
      faviconUrl: "https://www.google.com/s2/favicons?sz=16&domain_url=example.com",
      latestPublishedDate: "August 1, 2026",
      latestPublishedRelative: "30d",
      publishFrequency: "3 days",
      meanIntervalDays: 3,
      currentGapDays: 30,
      thresholdDays: 12,
      ratio: 10,
    },
  ];

  const html = buildEmailHtml(feeds);

  const expected =
    '<ol><li><strong><a href="https://example.com/rss.xml"><img src="https://www.google.com/s2/favicons?sz=16&domain_url=example.com" alt="" width="16" height="16" style="vertical-align:middle;margin-right:6px;" />&lt;Broken&gt; &amp; Feed</a></strong><br><a href="https://example.com">Site</a> · <a href="https://feedbin.com/settings/subscriptions?q=https%3A%2F%2Fexample.com%2Frss.xml">Feedbin subscription</a><br>Latest published: August 1, 2026 (30d ago)<br>Usually publishes every 3 days</li></ol>';

  assertEquals(html, expected);
});
