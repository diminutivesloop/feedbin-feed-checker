import { assertEquals } from "jsr:@std/assert";
import {
  daysFromMs,
  formatDuration,
  formatHumanDate,
  pluralize,
} from "./formatting.ts";

Deno.test("formatHumanDate formats a date without time", () => {
  const ms = Date.UTC(2026, 7, 27, 15, 30);
  const formatted = formatHumanDate(ms);
  assertEquals(formatted, "August 27, 2026");
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

Deno.test("pluralize singular", () => {
  assertEquals(pluralize(1, "day"), "1 day");
});

Deno.test("pluralize plural", () => {
  assertEquals(pluralize(2, "day"), "2 days");
});

Deno.test("pluralize rounds fractional values", () => {
  assertEquals(pluralize(1.6, "week"), "2 weeks");
});
