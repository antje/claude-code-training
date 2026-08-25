# EPIC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code. Generated with `/epic`, then edited by a human.
> Load it as context when you build: `@docs/epics/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** Antje Barth
**Status:** reviewed

## Problem

Dana's ops team exports the payments table several times a day — merchant queries, month-end
reconciliation, ad-hoc Finance asks — and every file comes out identical: all ten columns, current
filter only, card last-four included. Because the last-four is always in there, anything going to a
merchant gets hand-edited first: 3–4 hours a month of spreadsheet work, and a near-miss last quarter
where an unedited file nearly went to the wrong merchant.

## Current state

Every claim carries a file path.

- `src/app/payments/page.tsx:71` — the Export button is a plain `<a href="/api/payments/export?…">`
  carrying the current query string. No dialog, no options. The link is the whole feature.
- `src/app/api/payments/export/route.ts` — the export handler. Calls `parseFilters()`, then
  `filterPayments()` + `sortPayments()`. It deliberately **skips** `paginate()`, so the full
  filtered set already ships today. Its own doc comment names the column set and scope as fixed and
  points at this ticket.
- `src/data/queries.ts:19` — `parseFilters()` is the existing allowlist boundary: status is checked
  against `STATUSES`, sort/direction are coerced to known literals, page is bounded. This is where
  new client input belongs.
- `src/data/queries.ts:44` — `filterPayments()` / `sortPayments()` / `paginate()` / `queryPayments()`.
  This is the one query builder the ticket says to reuse.
- `src/lib/csv.ts:14` — `EXPORT_COLUMNS` (10-column `as const` tuple) and `ExportColumn`.
  `toCsv(payments, columns = EXPORT_COLUMNS)` **already accepts a column subset in the requested
  order** — the capability exists, nothing calls it with anything but the default.
- `src/lib/csv.ts:83` — `exportFilename(date)` returns `payments-YYYY-MM-DD.csv`. No scope segment.
- `src/lib/money.ts:16` — `formatMoney(minorUnits, currency)`. `csv.ts` already calls it for the
  `amount` cell and `currency` is already its own column, so acceptance criterion 4 mostly holds
  today; the work is to keep it that way.
- `src/lib/csv.test.ts` — the file the DoD says to extend. It already pins subset-and-order
  (`"writes only the requested columns, in the order given"`), escaping, and the filename format.
- `src/app/payments/filter-bar.tsx` — the pattern for a client component beside the page.

**Where the ticket and the code disagree:**

- The ticket warns "do not interpolate column names into SQL". There is no SQL — the store is
  in-memory JSON (`src/data/store.ts`). The real risk is the same shape though: an unvalidated
  column name reaching `cell()` or the `content-disposition` filename. Validate anyway.
- The ticket warns the export currently ships only the current page. It does not —
  `export/route.ts` skips `paginate()`. The warning is about the **fix**: building the dialog's
  export in the browser off the rendered rows would introduce that bug. Keep it server-side.
- `.claude/rules/components.md` claims `src/components/` already has a `Dialog`. It does not — only
  `Drawer.tsx`, built on `@radix-ui/react-dialog`. That dependency is already installed, so a
  Tremor-style `Dialog.tsx` is a new file, not a new dependency.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. `$250.00` is `25000`. Format once, at the edge, next to its currency code." | `merchant-console/CLAUDE.md` | Cents drift; the CSV and the table disagree |
| "Storage and bucketing are UTC. Display converts to the merchant's timezone. Nothing else does." | `merchant-console/CLAUDE.md` | The filename date flips a day for anyone west of UTC |
| "One query builder. Payment filtering goes through the builder behind `GET /api/payments`." | `merchant-console/CLAUDE.md` | Two filter paths drift; export stops matching the table |
| "Validate on the server. Anything from the client … is checked against an allowlist before it reaches a query, a filename, or the store." | `merchant-console/CLAUDE.md`, `.claude/rules/api-routes.md` | A crafted `columns` param reaches `cell()` or the filename header |
| "Dialogs and forms must be operable … accessible name, focus moves into it and returns on close, Escape closes it." | `.claude/rules/components.md` | Ops navigates this by keyboard all day |
| "Card last-four is **off** by default." | NWP-101 AC 1 | The 3–4 hours/month of manual editing stays |

## Approach

Keep the export a plain `GET` that the browser downloads — no fetch, no blob, no client-side row
assembly. Add two allowlisted query parameters, `columns` (comma-separated) and `scope`
(`filtered` | `all`), parsed and validated **server-side** in `src/lib/csv.ts` (`parseColumns`) and
the export route. `scope=all` means "ignore the filters", which the existing builder already
expresses as an empty filter object — so `filterPayments()` stays the single filter path either way.
`exportFilename()` grows a scope segment. On the client, a new `ExportDialog` client component
replaces the bare Export link: checkboxes for the ten columns (last-four unchecked), a scope radio
pair, a live row count for each scope, and a Download button that is disabled when nothing is
selected and otherwise navigates to the built URL. Row counts come from the existing
`GET /api/payments` (`total` in its response), passed in as props from the server page — no second
count endpoint.

**Considered and rejected:** fetching the rows in the dialog and building the CSV in the browser
with a Blob. It looks tidier and needs no route change, but the table is paginated — the client only
ever holds 20 rows — so it would export the visible page and call it the feature. That is precisely
the bug the ticket warns about. Rejected.

**Also rejected:** a `POST /api/payments/export` taking a JSON body. Cleaner for long column lists,
but it stops the browser handling the download as a navigation, forcing blob plumbing on the client
for no benefit at ten columns.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | change | Add `parseColumns()` (allowlist + order + dedupe), `DEFAULT_EXPORT_COLUMNS` (no `last4`), and a scope-aware `exportFilename()` |
| `src/lib/csv.test.ts` | change | Extend, per the DoD: subset in requested order, last-four excluded by default, empty selection, filename scope |
| `src/app/api/payments/export/route.ts` | change | Read + validate `columns` and `scope`; 400 on empty selection; pass the subset to `toCsv` |
| `src/components/Dialog.tsx` | add | Tremor-style dialog on the already-installed `@radix-ui/react-dialog`; the rules assume it exists |
| `src/components/Checkbox.tsx` | add | Labelled checkbox primitive; none exists and the dialog needs ten |
| `src/app/payments/export-dialog.tsx` | add | The client component: column checkboxes, scope choice, row count, disabled Download |
| `src/app/payments/page.tsx` | change | Render `ExportDialog` instead of the bare link; pass filtered/all totals and the current query |

## Plan

Sequenced so each step ends somewhere verifiable.

1. **Serializer + filename in `src/lib/csv.ts`** — done when: `parseColumns(["id","nope","id"])`
   returns `["id"]`, `DEFAULT_EXPORT_COLUMNS` omits `last4`, and
   `exportFilename(date, "disputed")` returns `payments-disputed-2026-08-13.csv`.
2. **Tests in `src/lib/csv.test.ts`** — done when: `npm test` is green with new cases for subset
   order, last-four-off-by-default, empty selection, and the scoped filename.
3. **Route handler validation** — done when: `curl '…/export?columns=id,amount'` returns two
   columns, `columns=` (empty) returns 400 and no file, and `scope=all&status=disputed` returns
   every payment rather than the disputed ones.
4. **`Dialog` + `Checkbox` primitives** — done when: they render, Escape closes, focus returns.
5. **`ExportDialog` wired into the payments page** — done when: opening it on
   `/payments?status=disputed` shows both row counts, last-four is unchecked, clearing every box
   disables Download, and downloading yields `payments-disputed-<date>.csv`.
6. **Full pass** — done when: `npm test` green, `npm run lint` clean, `npx tsc --noEmit` clean.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Ops can choose columns; last-four **off** by default | `csv.test.ts` → "excludes the card last four by default"; and unchecking/checking boxes in the dialog changes the downloaded header row |
| Scope current-filter (default) or all; row count visible before download | Dialog shows "N rows" per scope from the server-supplied totals; `scope=all&status=disputed` returns the full set via curl |
| Filename reflects scope and date | `csv.test.ts` → `exportFilename(new Date("2026-08-13…"), "disputed")` === `payments-disputed-2026-08-13.csv`; confirmed in the `content-disposition` header |
| Amounts stay minor units internally, formatted once on the way out, currency in its own column | `toCsv` still calls `formatMoney` in `cell()` only; `currency` remains its own column; existing money tests stay green |
| Deselecting every column disables Download rather than producing an empty file | Dialog: Download `disabled` when the set is empty. Server: `columns=` → 400, proven by `csv.test.ts` on `parseColumns` and by curl |

## Risks

- **A second filter path sneaks in.** `scope=all` is tempting to implement as `store.payments`
  directly. Mitigation: express it as `filterPayments({})` so there is still exactly one builder.
- **UTC drift in the filename.** `new Date().toISOString().slice(0,10)` is already UTC; keep it and
  do not reach for a locale formatter.
- **Column order.** Ops expects a stable order. `parseColumns` preserves the client's requested
  order (the existing test pins this behaviour for `toCsv`); the dialog emits them in
  `EXPORT_COLUMNS` order so the default file looks unchanged minus `last4`.
- **Long URLs.** Ten column names in a query string is ~90 characters. Fine. It stops being fine
  around a hundred columns, and that is when the POST option comes back.

## Out of scope

- Persisting a user's column preference — no user store exists (persistence is NWP-203).
- Excel/XLSX output, scheduled exports, emailing the file.
- Masking or removing last-four from the payments **table** itself; the ticket is about the export.
- The `sortPayments` amount ordering, which sorts `String(a.amount)` lexicographically. Real, but
  a separate defect — see NWP-102 / the extra-credit ticket, not this branch.

## Open questions

- Should `scope=all` also ignore the *sort* the table is under? Assumed **no**: sort is a
  presentation choice, not a filter, so it carries over. Cheap to flip.
