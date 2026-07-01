export const DEFAULT_PLAN_TIME_ZONE = "Asia/Shanghai";

export function formatPlanDate(date = new Date(), timeZone = DEFAULT_PLAN_TIME_ZONE): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const year = getDatePart(parts, "year");
  const month = getDatePart(parts, "month");
  const day = getDatePart(parts, "day");

  return `${year}-${month}-${day}`;
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((item) => item.type === type);
  if (!part) {
    throw new Error(`Unable to format plan date: missing ${type}.`);
  }

  return part.value;
}
