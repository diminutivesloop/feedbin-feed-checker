export function formatHumanDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type DurationParts = {
  value: number;
  unit: string;
};

function getDurationParts(ms: number): DurationParts {
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
  }

  return pluralize(parts.value, parts.unit);
}
