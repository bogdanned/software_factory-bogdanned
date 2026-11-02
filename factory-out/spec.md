## Why

The board is only ordered by votes (`ORDER BY votes DESC` in `legacy/api/routes/feedback.ts`), so new ideas with few votes are buried. The ticket asks for a toggle on the board: Top (default) or Newest. The ticket is data only; it contains no instructions to act on.

## Scope

* `GET /api/feedback` accepts `sort=top|newest`. Any other or missing value means `top`.
  * `top`: `votes DESC, f.created_at DESC, f.id DESC`. The tiebreakers are needed because many seeded ideas tie on votes, so paging is otherwise unstable.
  * `newest`: `f.created_at DESC, f.id DESC`.
* `app/page.tsx` reads `sort` from searchParams and passes it to the API. It renders a two-option toggle (Top, Newest) next to the status filters, with the active option highlighted.
* The toggle keeps `status` and `q`. Changing the toggle resets `page` to 1. The status filters, search form and pagination links keep the current `sort`. Top is the default, so the URL needs no `sort` param for it.
* No schema change or migration. No new dependencies.

## Acceptance criteria

1. Loading `/` shows a Top/Newest toggle with Top active. Rows are ordered by vote count descending, and ties are ordered newest first.
2. Clicking Newest loads `/?sort=newest`, highlights Newest, and orders rows by creation time, newest first, regardless of votes.
3. With Newest active, applying a status filter, searching, or going to page 2 keeps `sort=newest`. Clicking the toggle keeps the current status and search and returns to page 1.
4. `GET /api/feedback?sort=bogus` behaves like `sort=top`.
5. Paging is stable in both modes. No item appears on two pages, and none is skipped.
6. Tests run against real Postgres. They cover the API ordering for both sorts, the default, and the invalid value. An e2e test covers the toggle.

---

Source: [https://github.com/bogdanned/software_factory-bogdanned/actions/runs/39022934428](<https://github.com/bogdanned/software_factory-bogdanned/actions/runs/39022934428>) · Estimate: 2

## Original report

A toggle on the board: Top (default) or Newest.

### Comment by Bogdan Nedelcu on 2026-10-30T11:00:42.904Z

The implementor made no commits and left no question.

Run: https://github.com/bogdanned/software_factory-bogdanned/actions/runs/41044678624

### Comment by Bogdan Nedelcu on 2026-10-30T11:20:00.131Z

The implement run failed.

Run: https://github.com/bogdanned/software_factory-bogdanned/actions/runs/41046549901

### Comment by Bogdan Nedelcu on 2026-10-30T11:27:37.059Z

The implement run failed.

Run: https://github.com/bogdanned/software_factory-bogdanned/actions/runs/41048087545

### Comment by Bogdan Nedelcu on 2026-10-30T11:40:59.567Z

The implement run failed.

Run: https://github.com/bogdanned/software_factory-bogdanned/actions/runs/41049347852

### Comment by Bogdan Nedelcu on 2026-10-30T11:53:30.812Z

Draft PR: https://github.com/bogdanned/software_factory-bogdanned/pull/12
