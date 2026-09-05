import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  buildEmailHtml,
  getFaviconUrl,
  mean,
  parseEntryTimestampMs,
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
      feedId: 1,
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

Deno.test("buildEmailHtml renders a NEW badge for feeds not in the previous report", () => {
  const feeds: FlaggedFeed[] = [
    {
      feedId: 2,
      title: "Fresh Feed",
      latestPublishedDate: "August 1, 2026",
      latestPublishedRelative: "10d",
      publishFrequency: "2 days",
      meanIntervalDays: 2,
      currentGapDays: 10,
      thresholdDays: 2,
      ratio: 5,
      isNew: true,
    },
    {
      feedId: 3,
      title: "Returning Feed",
      latestPublishedDate: "July 1, 2026",
      latestPublishedRelative: "40d",
      publishFrequency: "4 days",
      meanIntervalDays: 4,
      currentGapDays: 40,
      thresholdDays: 4,
      ratio: 10,
    },
  ];

  const html = buildEmailHtml(feeds);

  assertStringIncludes(html, "Fresh Feed</strong> <span");
  assertStringIncludes(html, ">NEW</span>");
  assertStringIncludes(html, "Returning Feed</strong><br>");
});
