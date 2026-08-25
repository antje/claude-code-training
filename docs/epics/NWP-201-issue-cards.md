# EPIC · NWP-201 — Issue virtual cards from the console

**Ticket:** [NWP-201](../tickets/NWP-201.md) · **Author:** Antje Barth · **Status:** reviewed
Load it when you build: `@docs/epics/NWP-201-issue-cards.md`

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand: hours of
turnaround, 12–20 times a week, and two cards last month with the wrong limit because the request
lived in a Slack thread. Merchants use them for vendor subscriptions, ad spend and contractor tools.

## Current state

There is no card domain yet — this is additive.

- `src/data/types.ts` — `Merchant`, `Payment`, `Refund`, `Dispute`, `Payout`. **No `Card`.**
- `src/data/store.ts:17` — `Store` pinned to `globalThis.__northwindStore` so dev-server reloads do
  not hand each request a fresh copy. `cards` must live here and survive the same way.
- `src/data/queries.ts:19` — `parseFilters()` is the existing allowlist boundary; `filterPayments()`
  is the one query builder. Card spend derives from it, not a second aggregation.
- `src/lib/money.ts:16,47` — `formatMoney()` and `parseAmountToMinorUnits()`, which already turns
  `"250.00"` into `25000` and returns `null` on garbage. Do not write a second converter.
- `src/lib/dates.ts:33` — `formatDate()`, UTC, for the created column.
- `src/components/` — Select, Input, Button, Table, Badge, **Drawer**. There is no `Dialog`;
  `.claude/rules/components.md` says use what is here, so the issue form uses `Drawer`.
- `src/components/ui/payments/StatusBadge.tsx` — the badge pattern to mirror.
- `src/app/siteConfig.ts:5` + `AppSidebar.tsx:26` — both need a `cards` entry or `/cards` is
  unreachable.
- `merchants.ts` carries a `currency` per merchant — the ticket does not mention it, but it is the
  reason a card must not settle in another currency.

## Domain rules

| Rule | Source | Breaks if ignored |
| --- | --- | --- |
| Money is integer minor units | `CLAUDE.md` | Cents drift; the wrong-limit incident repeats |
| 4242 BIN + valid Luhn, generated server-side | `.claude/rules/cards.md` | Something resembles a real PAN |
| Reveal once — never on the record, a list, or client state after close | `.claude/rules/cards.md` | A full PAN becomes re-readable |
| `active ⇄ frozen`, either → `cancelled`, terminal. Guard on the server | `.claude/rules/cards.md` | curl resurrects a cancelled card |
| Validate client input against an allowlist | `.claude/rules/api-routes.md` | Bad merchant/currency/limit reaches the store |

## Approach

`src/lib/cards.ts` owns the domain as pure functions — Luhn, a `4242` generator seeded from
`crypto.randomInt`, `maskCard`, and the state machine as a table — so it is trivially testable and
cannot leak. `src/data/cards.ts` is the validation boundary and the store writes; routes stay thin.

Reveal-once is **structural**: the stored `Card` has no field for a full number, so `issueCard()`
returns `{ card, fullNumber }` separately and only the 201 body carries it. No `GET` can return what
was never stored.

**Rejected:** storing the PAN encrypted for later reveal — it adds a key, a decrypt path and a
permanent way for the number to exist. **Rejected:** a separate cards store — `store.ts` is one
`globalThis`-pinned object; a second would not survive reloads and would be a second source of truth.

## File map

| File | Why |
| --- | --- |
| `src/lib/cards.ts` (+ `.test.ts`) | Luhn, generator, mask, transition table |
| `src/data/cards.ts` (+ `.test.ts`) | Allowlist validation, issue, status, spend, idempotency |
| `src/data/types.ts`, `store.ts` | `Card`, `CardEvent`, `CardStatus`; `cards` on the store |
| `src/app/api/cards/route.ts`, `[id]/route.ts` | GET/POST, GET/PATCH with the guard |
| `src/app/cards/{page,issue-dialog,card-actions,[id]/page}.tsx` | List, issue + reveal, actions, detail |
| `src/components/ui/cards/CardStatusBadge.tsx` | Mirrors the payments badge |
| `siteConfig.ts`, `AppSidebar.tsx` | Nav entry |

## Plan

1. Types + `lib/cards.ts` — done when a generated number starts `4242` and passes Luhn.
2. `lib/cards.test.ts` — done when `npm test` is green over many generations and the full matrix.
3. Store + `data/cards.ts` — done when each bad input the ticket names is rejected.
4. Routes — done when curl shows the number once, `columns=`-style bad input 400s, and
   `cancelled → active` returns 409.
5. List + issue + reveal — done when the number shows once and the card appears masked.
6. Detail + bar + freeze/cancel + nav — done when amber past 80% and status changes without reload.
7. `npm test`, lint, `tsc`, build, `/ship-ready`.

## Verification

| Criterion | Proven by |
| --- | --- |
| Issue / list / detail | Clicked through; screenshots |
| 4242 + Luhn, server-side | `cards.test.ts` over 500 generations |
| Reveal once | No field on the type; curl shows GET lacks the number |
| Server-side validation | One curl per rejected input, each a 400 with the field |
| Stretch | Named individually in the PR with evidence |

## Risks

- A second filter path for spend — mitigated by deriving from `filterPayments`.
- Transition guarded only in the UI — mitigated by proving 409 with curl, not clicks.
- Clock spent on persistence/auth/limit-editing, all explicitly worth zero.

## Out of scope

Persistence (NWP-203), auth, real card network calls, editing a limit after issue (NWP-202).

## Resolved during the build

- **Must a card's currency match its merchant?** Opened as a question, closed as **yes**:
  `merchants.ts` carries a currency, and a mismatch makes every spend-vs-limit comparison
  cross-currency, which `src/lib/money.ts:38` calls meaningless. Enforced in `parseIssueRequest`.
- **What does a retried issue do?** `Idempotency-Key` header; a repeat returns 200 with the existing
  card and **no** number — reveal-once means once, even on a retry.
- **How does ops answer "what happened last Tuesday"?** Append-only `history: CardEvent[]`, opened by
  the issue event, appended on every accepted transition, rendered on the detail page.
