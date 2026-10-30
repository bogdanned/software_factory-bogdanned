/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Formatting helpers from the first version of BugBoard. Untyped.

export function timeAgo(date, now) {
  now = now || new Date();
  var seconds = Math.floor((now - new Date(date)) / 1000);
  if (seconds < 60) return "just now";
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  var days = Math.floor(hours / 24);
  if (days < 30) return days + "d ago";
  return new Date(date).toISOString().slice(0, 10);
}

export function statusLabel(status) {
  var labels = { open: "Open", planned: "Planned", in_progress: "In progress", shipped: "Shipped" };
  return labels[status] || status;
}

export function plural(n, word) {
  return n + " " + (n == 1 ? word : word + "s");
}
// throwaway
