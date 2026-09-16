// mobile/src/utils/dateOnly.js
//
// Shared helpers for date-only values (no time-of-day) - e.g. a
// birthday. Used by DateTimeInput (mode="date") and anywhere that reads
// one back from the API.

// Converts a Date to a 'YYYY-MM-DD' string using its LOCAL y/m/d.
// `date.toISOString().split('T')[0]` looks equivalent but silently
// shifts the date by a day for anyone not at UTC+0, because
// toISOString() converts through UTC first.
export function toDateOnlyString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// The inverse: a 'YYYY-MM-DD' (or an ISO timestamp at UTC midnight, as
// the API sometimes returns) back into a local-time Date at midnight.
// `new Date(string)` interprets a date-only string as UTC and then
// renders it in the viewer's local timezone, which rolls it back a day
// for anyone west of UTC (e.g. Feb 1 becomes Jan 31 for US timezones).
// Building the Date from the y/m/d components directly avoids that.
export function parseDateOnly(dateString) {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}
