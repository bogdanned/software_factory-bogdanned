---
name: bugboard-browser-qa
description: Use when checking a BugBoard acceptance criterion in the browser.
---

- The app is http://localhost:3000. Visit nothing else.
- Customers: /sign-in → "Continue as Ada" or "Continue as Lin". Admin: the password under "This run".
- Pages: / (board), /feedback/[id], /new, /changelog, /admin, /admin/digest, /admin/outbox.
- Untestable = the criterion needs something this stack lacks (a real inbox). Say what.
- One screenshot per criterion. A slow page is a retry (max 3), not a fail.
