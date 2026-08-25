# EPIC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/epic`, then edited by a human.
> Load it as context when you build: `@docs/epics/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Antje Barth
**Status:** reviewed

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours,
happens 12–20 times a week, and last month two cards went out with the wrong spend limit because the
request lived in a Slack thread. Merchants use these for vendor subscriptions, ad spend and
contractor tools: single-merchant, always virtual, and they need a limit from the moment they exist.
Marcus wants it in the console today.

## Current state

Every claim carries a file path. **There is no card domain in this codebase yet** — this is additive,
not a change to existing behaviour.

- `src/data/types.ts` — has `Merchant`, `Payment`, `Refund`, `Dispute`, `Payout`. **No `Card`.**
  `Payment.cardBrand` / `Payment.last4` are the only card-ish fields and they belong to payments.
- `src/data/store.ts:17` — `Store` interface holds `merchants`, `payments`, `refunds`, `disputes`,
  `payouts`. Pinned to `globalThis.__northwindStore` so dev-server module reloads do not hand each
  request a fresh copy. **A `cards` array must be added here**, and it must survive the same way.
- `src/data/queries.ts` — the one query builder. `parseFilters()` is the allowlist boundary;
  `filterPayments`/`sortPayments`/`paginate` are payment-specific. Card lookups belong beside them
  in this file, not in a new module.
- `src/app/api/payments/route.ts` — the route-handler shape: parse via allowlist, return
  `NextResponse.json`. Only two API routes exist today; there is no POST or PATCH anywhere yet, so
  this ticket introduces the repo's first write endpoints.
- `src/lib/money.ts:16` — `formatMoney(minorUnits, currency)`. `parseAmountToMinorUnits(input)` at
  `:47` already converts user input like `"250.00"` to `25000` and returns `null` on garbage — this
  is the boundary converter the limit field needs. Do not write a second one.
- `src/lib/dates.ts:33` — `formatDate(iso)`, UTC. For the created-date column.
- `src/components/` — Tremor primitives: `Select`, `Input`, `Button`, `Table`, `Badge`, `Divider`,
  `Drawer`. **There is no `Dialog`** — `.claude/rules/components.md` says to reach for one, but only
  `Drawer.tsx` exists, built on `@radix-ui/react-dialog`. That dependency is already installed, so a
  Tremor-style `Dialog.tsx` is a new file, not a new package.
- `src/components/ui/payments/StatusBadge.tsx` — the badge pattern to mirror for card status.
- `src/components/ui/navigation/AppSidebar.tsx:26` — `navigation` array; `siteConfig.baseLinks`
  (`src/app/siteConfig.ts:5`) has no `cards` entry. Both need one or the page is unreachable.
- `.claude/rules/cards.md` — the binding rules: 4242 BIN, Luhn, generate server-side, reveal once,
  mask everywhere, status guarded **on the server**.

**Where the ticket and the code agree:** the ticket says "the codebase already knows things this
ticket does not". Concretely: `parseAmountToMinorUnits` exists, `formatMoney` exists, the store is
`globalThis`-pinned for a reason, and `merchants.ts` already carries a per-merchant `currency` —
which is the sane default for a card's currency and a real validation signal.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. `$250.00` is `25000`." | ticket, `merchant-console/CLAUDE.md` | Limits drift; the wrong-limit incident repeats |
| "Every generated number starts `4242` and carries a valid Luhn check digit." | `.claude/rules/cards.md` | Something in the repo resembles a real PAN |
| "Generate on the server. A card number produced in the browser is a bug." | `.claude/rules/cards.md` | The number is guessable/loggable client-side |
| "Reveal once … not on the card record, not in a list or detail payload, not left in client state after the success screen closes." | `.claude/rules/cards.md` | A full PAN becomes re-readable — the worst failure here |
| "Status is a state machine. `active ⇄ frozen`, either to `cancelled`, `cancelled` is terminal. Guard the transition on the server, not only in the UI." | `.claude/rules/cards.md` | A cancelled card comes back to life via curl |
| "Validate on the server. Anything from the client … checked against an allowlist." | `CLAUDE.md`, `.claude/rules/api-routes.md` | Bad merchant/currency/limit reaches the store |
| "Do not add a database, an ORM, or migrations." | ticket Out of scope, app `CLAUDE.md` | Clock burned on something worth zero |

## Approach

Server first, UI second — the order the mission recommends and the order the grader weighs.

A new `src/lib/cards.ts` owns the card domain logic with no React and no store access: a Luhn check
digit calculator, a `4242`-BIN number generator seeded from `crypto.randomInt`, `maskCard(last4)`,
and `canTransition(from, to)` encoding the state machine as data. Pure functions, so the unit tests
are trivial and fast — the ticket names these as the cheapest stretch goal and they double as the
"give Claude a way to check itself" step.

`src/data/cards.ts` holds the validation boundary: `parseIssueRequest(body)` returns either a
validated request or a list of field errors, checking merchant against `store.merchants`, currency
against `["USD","EUR","GBP"]`, and limit as an integer in `1..5_000_000`. The route handler stays
thin and returns the same error shape everywhere, per `.claude/rules/api-routes.md`.

The **reveal-once** guarantee is structural, not a convention: `Card` as stored has `last4` and
`reference` and **no field for the full number**, so there is nowhere for it to leak from. The
generator returns `{ card, fullNumber }`; the route puts `fullNumber` in the 201 response body only.
Any later `GET` physically cannot return it.

Card spend is derived, not stored: sum the merchant's captured payments through the existing query
builder rather than inventing a second aggregation. That keeps convention 3 intact and gives the
detail page a real number for the progress bar.

**Considered and rejected:** storing the full PAN encrypted and decrypting for the reveal. It is what
a real issuer does, and it is wrong here — it adds a key, a decrypt path, and a permanent way for a
full number to exist in the process. The ticket says reveal once; a value that cannot be re-read is
strictly safer than one that can.

**Also rejected:** a `cards` slice in a new store module. `store.ts` is one object pinned to
`globalThis`; a second store would not survive dev-server reloads the same way and would be a second
source of truth.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | `Card`, `CardStatus`, `MerchantCategory` — no full-number field, by design |
| `src/lib/cards.ts` | add | Luhn, 4242 generator, mask, `canTransition`. Pure, server-side |
| `src/lib/cards.test.ts` | add | Luhn validity, BIN prefix, mask, every legal and illegal transition |
| `src/data/cards.ts` | add | `parseIssueRequest` allowlist validation; `issueCard`, `setCardStatus`, `cardSpend` |
| `src/data/store.ts` | change | `cards: Card[]` on the pinned store |
| `src/app/api/cards/route.ts` | add | `GET` list (masked), `POST` issue (201, full number exactly once) |
| `src/app/api/cards/[id]/route.ts` | add | `GET` one, `PATCH` status with the transition guarded server-side |
| `src/app/cards/page.tsx` | add | `/cards` list: nickname, merchant, masked number, limit, status, created |
| `src/app/cards/issue-dialog.tsx` | add | Issue form + one-time reveal success screen |
| `src/app/cards/card-actions.tsx` | add | Freeze/unfreeze inline via `router.refresh()`, no full reload |
| `src/app/cards/[id]/page.tsx` | add | Detail: full record + spend-vs-limit progress bar, amber past 80% |
| `src/components/ui/cards/CardStatusBadge.tsx` | add | Mirrors `ui/payments/StatusBadge.tsx` |
| `src/components/Dialog.tsx` | add | Tremor-style dialog on the installed `@radix-ui/react-dialog`; the rules assume it exists |
| `src/app/siteConfig.ts` | change | `cards` base link |
| `src/components/ui/navigation/AppSidebar.tsx` | change | Nav entry, else `/cards` is unreachable |

## Plan

Sequenced so each step ends somewhere verifiable.

1. **Types + `src/lib/cards.ts`** — done when: `luhnCheckDigit` makes every generated number pass a
   Luhn validator, and generated numbers start `4242`.
2. **`src/lib/cards.test.ts`** — done when: `npm test` green, covering Luhn, BIN, mask, and all
   transitions including `cancelled → *` rejected.
3. **Store + `src/data/cards.ts`** — done when: `issueCard` appends to `store.cards` and
   `parseIssueRequest` rejects each of the four bad inputs the ticket names.
4. **API routes** — done when: `curl` POST issues a card and returns the full number once; a second
   `GET` of the same card returns only `last4`; PATCH `active→frozen→active` succeeds and
   `cancelled→active` returns 409.
5. **List + issue dialog + reveal** — done when: issuing from the UI shows the number once and the
   card appears masked in the list.
6. **Detail + progress bar + freeze/unfreeze + nav** — done when: `/cards/<id>` renders spend against
   limit, amber past 80%, and freeze toggles without a page reload.
7. **Full pass** — `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, then `/ship-ready`.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card (nickname, merchant, limit, currency) | Click through the dialog; card appears in the list |
| Card list at `/cards` with the six columns | Screenshot of `/cards` |
| Card detail with spend against limit | `/cards/<id>` renders the bar; amber past 80% |
| Numbers server-side, 4242 BIN, valid Luhn | `cards.test.ts` asserts BIN + Luhn over many generated numbers |
| Reveal once, mask forever | `Card` has no full-number field; `GET` responses contain only `last4`, shown by curl |
| Server-side validation (merchant, ≤0, >5,000,000, currency) | Four curl calls, each returning 400 with a field error |
| Stretch: freeze/unfreeze, progress bar, tests, empty/error states | Named individually in the PR with evidence |

## Risks

- **A full number leaking into a payload.** Mitigated structurally: the stored type has no field for
  it. The risk that remains is logging it — so it is never passed to anything but the 201 body.
- **Transition guarded only in the UI.** Mitigated by putting `canTransition` in the route and
  proving `cancelled → active` returns 409 by curl, not by clicking.
- **A second query builder for spend.** Mitigated by deriving spend from the existing payment
  filters rather than a new aggregation.
- **Clock.** Persistence, auth and limit-editing are explicitly worth zero. Not building them.

## Out of scope

Persistence (NWP-203), auth/roles, real card network calls, editing a limit after issue (NWP-202).

## Resolved during the build

- **Should a card's currency be forced to its merchant's currency?** Opened as a question, closed as
  **yes**. `merchants.ts` carries a `currency` per merchant, and card spend is compared against a
  limit — so a card settling in a currency its merchant does not use makes every spend-vs-limit
  comparison a cross-currency one, which `src/lib/money.ts:38` calls meaningless. Enforced in
  `parseIssueRequest`, not merely defaulted in the form, because the client is not trusted. The
  form locks the currency select once a merchant is chosen and says why.

- **What should a retried issue request do?** Ops clicking twice on a slow connection is exactly how
  the wrong-limit incident started. `POST /api/cards` accepts an `Idempotency-Key` header; a repeat
  returns `200` with the existing card and **no** `fullNumber`, because reveal-once means once even
  on a retry. A `201` with a replayed number would be a second reveal.

- **How does ops answer "what happened to this card last Tuesday"?** Each card carries an
  append-only `history: CardEvent[]`, opened by its issue event and appended on every accepted
  transition. A refused transition writes nothing. Rendered newest-first on the detail page.
