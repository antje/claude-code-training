import {
  cardReference,
  canTransition,
  generateCardNumber,
  lastFour,
} from "@/lib/cards"
import { merchantById } from "./merchants"
import { filterPayments } from "./queries"
import { store } from "./store"
import { Card, CardEvent, CardStatus, Currency, MerchantCategory } from "./types"

/**
 * The card store boundary.
 *
 * Everything arriving from a client is checked against an allowlist here before
 * it reaches the store, a filename, or a query — the client is not trusted
 * (`.claude/rules/api-routes.md`). Route handlers stay thin and call into this.
 */

/** The only currencies a card may be issued in. */
export const CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

/** Spend categories a card can be locked to. */
export const CARD_CATEGORIES: readonly MerchantCategory[] = [
  "any",
  "advertising",
  "software",
  "travel",
  "contractors",
]

/**
 * Ceiling on a spend limit, in integer minor units: 5,000,000 = $50,000.00.
 * Above this the request is a typo, not a card.
 */
export const MAX_SPEND_LIMIT = 5_000_000

/** Longest nickname we will store, so a label cannot become a payload. */
const MAX_NICKNAME_LENGTH = 60

export interface IssueCardRequest {
  nickname: string
  merchantId: string
  spendLimit: number
  currency: Currency
  category: MerchantCategory
}

/** A rejection carries the field so the form can put the message next to the input. */
export interface FieldError {
  field: string
  message: string
}

export type ParseResult =
  | { ok: true; value: IssueCardRequest }
  | { ok: false; errors: FieldError[] }

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {}
}

/**
 * Validate an issue request against the allowlist.
 *
 * Collects every problem rather than returning the first, so a form can show
 * all of them at once instead of making ops submit four times.
 */
export function parseIssueRequest(body: unknown): ParseResult {
  const raw = asRecord(body)
  const errors: FieldError[] = []

  const nickname = typeof raw.nickname === "string" ? raw.nickname.trim() : ""
  if (nickname.length === 0) {
    errors.push({ field: "nickname", message: "Give the card a nickname." })
  } else if (nickname.length > MAX_NICKNAME_LENGTH) {
    errors.push({
      field: "nickname",
      message: `Keep the nickname under ${MAX_NICKNAME_LENGTH} characters.`,
    })
  }

  const merchantId = typeof raw.merchantId === "string" ? raw.merchantId : ""
  if (!merchantId) {
    errors.push({ field: "merchantId", message: "Choose a merchant." })
  } else if (!merchantById(merchantId)) {
    errors.push({ field: "merchantId", message: "Unknown merchant." })
  }

  // Money is integer minor units. A float or a "$250.00" string is not a limit.
  const spendLimit = raw.spendLimit
  if (typeof spendLimit !== "number" || !Number.isInteger(spendLimit)) {
    errors.push({
      field: "spendLimit",
      message: "Spend limit must be a whole number of minor units.",
    })
  } else if (spendLimit <= 0) {
    errors.push({
      field: "spendLimit",
      message: "Spend limit must be greater than zero.",
    })
  } else if (spendLimit > MAX_SPEND_LIMIT) {
    errors.push({
      field: "spendLimit",
      message: "Spend limit cannot exceed 5,000,000 minor units.",
    })
  }

  const currency = raw.currency
  const merchant = merchantById(merchantId)
  if (!CARD_CURRENCIES.includes(currency as Currency)) {
    errors.push({
      field: "currency",
      message: "Currency must be USD, EUR or GBP.",
    })
  } else if (merchant && currency !== merchant.currency) {
    // A card settles with its merchant. Issuing in another currency would make
    // every spend-against-limit comparison a cross-currency one, which
    // `src/lib/money.ts` calls meaningless. Enforced here, not only defaulted
    // in the form, because the client is not trusted.
    errors.push({
      field: "currency",
      message: `${merchant.name} settles in ${merchant.currency}; a card for them must be ${merchant.currency}.`,
    })
  }

  // Category is optional; anything unrecognised falls back rather than failing,
  // because it is a convenience filter and not a money-affecting field.
  const category = CARD_CATEGORIES.includes(raw.category as MerchantCategory)
    ? (raw.category as MerchantCategory)
    : "any"

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      nickname,
      merchantId,
      spendLimit: spendLimit as number,
      currency: currency as Currency,
      category,
    },
  }
}

/**
 * Cards are append-only — `cancelled` is a status, not a delete — so the count
 * is a stable sequence. Deliberately not a module-level counter: the store
 * lives on `globalThis` and survives dev-server module reloads, so a counter
 * beside it would reset out of step and reissue an id that already exists.
 */
function nextCardId(): string {
  return `crd_${String(store.cards.length + 1).padStart(6, "0")}`
}

/**
 * Issue a card.
 *
 * Returns the stored record and the full number **separately**. The number is
 * not on the record and is never stored, so this is the only moment it exists:
 * the caller puts it in the creation response and then it is gone.
 */
export function issueCard(
  request: IssueCardRequest,
  now = new Date(),
  idempotencyKey?: string,
): { card: Card; fullNumber: string } {
  const fullNumber = generateCardNumber()
  const at = now.toISOString()

  const card: Card = {
    id: nextCardId(),
    nickname: request.nickname,
    merchantId: request.merchantId,
    last4: lastFour(fullNumber),
    reference: cardReference(),
    spendLimit: request.spendLimit,
    currency: request.currency,
    status: "active",
    category: request.category,
    createdAt: at,
    history: [{ at, from: null, to: "active" }],
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }

  store.cards.unshift(card)
  return { card, fullNumber }
}

/**
 * A card already issued under this idempotency key, if any.
 *
 * A retried POST must not mint a second card. The full number is deliberately
 * **not** replayed — reveal-once means once, so a retry gets the record and a
 * flag saying it already existed.
 */
export function cardByIdempotencyKey(key: string): Card | null {
  return store.cards.find((card) => card.idempotencyKey === key) ?? null
}

/** Every issued card, newest first. Masked by construction — there is no number to hide. */
export function listCards(): Card[] {
  return store.cards
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

export type TransitionResult =
  | { ok: true; card: Card }
  | { ok: false; reason: "not_found" | "illegal_transition"; message: string }

/**
 * Move a card to a new status, guarding the state machine on the server.
 *
 * The UI hides buttons it should not offer, but that is a convenience — this is
 * the enforcement, so a curl cannot resurrect a cancelled card.
 */
export function setCardStatus(id: string, to: CardStatus): TransitionResult {
  const card = cardById(id)
  if (!card) {
    return { ok: false, reason: "not_found", message: "No such card." }
  }

  if (!canTransition(card.status, to)) {
    return {
      ok: false,
      reason: "illegal_transition",
      message:
        card.status === "cancelled"
          ? "A cancelled card is terminal and cannot change status."
          : `A card cannot go from ${card.status} to ${to}.`,
    }
  }

  card.history.push({ at: new Date().toISOString(), from: card.status, to })
  card.status = to
  return { ok: true, card }
}

/**
 * Spend against a card, in the card's minor units.
 *
 * Derived from the merchant's captured payments through the existing query
 * builder rather than a second aggregation, and filtered to the card's own
 * currency — summing across currencies would produce a meaningless number
 * (`src/lib/money.ts`). Cards carry no transactions of their own until
 * NWP-203, so this is an approximation and is labelled as one in the UI.
 */
export function cardSpend(card: Card): number {
  return filterPayments({ merchantId: card.merchantId, status: "captured" })
    .filter((payment) => payment.currency === card.currency)
    .reduce((total, payment) => total + payment.amount, 0)
}
