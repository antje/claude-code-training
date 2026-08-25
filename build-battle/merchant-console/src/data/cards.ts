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
 * The card store boundary. Everything from a client is checked against an
 * allowlist here before it reaches the store (`.claude/rules/api-routes.md`).
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

/** Ceiling in integer minor units: 5,000,000 = $50,000.00. Above this it is a typo. */
export const MAX_SPEND_LIMIT = 5_000_000

/** So a label cannot become a payload. */
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

/** Collects every problem, so the form shows them at once rather than one per submit. */
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
    // A card settles with its merchant; a mismatch makes every spend-vs-limit
    // comparison cross-currency, which src/lib/money.ts calls meaningless.
    errors.push({
      field: "currency",
      message: `${merchant.name} settles in ${merchant.currency}; a card for them must be ${merchant.currency}.`,
    })
  }

  // Optional: unrecognised falls back rather than failing — it affects no money.
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
 * Cards are append-only (`cancelled` is a status, not a delete), so the count is
 * a stable sequence. Not a module counter: the store survives dev-server module
 * reloads and a counter beside it would reset out of step and reissue an id.
 */
function nextCardId(): string {
  return `crd_${String(store.cards.length + 1).padStart(6, "0")}`
}

/**
 * Returns the record and the full number **separately**. The number is never
 * stored, so this is the only moment it exists.
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

/** A retried POST must not mint a second card. The number is never replayed. */
export function cardByIdempotencyKey(key: string): Card | null {
  return store.cards.find((card) => card.idempotencyKey === key) ?? null
}

/** Newest first. Masked by construction — there is no number to hide. */
export function listCards(): Card[] {
  return store.cards
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

export type TransitionResult =
  | { ok: true; card: Card }
  | { ok: false; reason: "not_found" | "illegal_transition"; message: string }

/** The enforcement — the UI hiding buttons is a convenience. curl cannot resurrect. */
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
 * Derived from the existing query builder, filtered to the card's own currency
 * — summing across currencies is meaningless. Cards carry no transactions of
 * their own until NWP-203, so this is an approximation, labelled as one in UI.
 */
export function cardSpend(card: Card): number {
  return filterPayments({ merchantId: card.merchantId, status: "captured" })
    .filter((payment) => payment.currency === card.currency)
    .reduce((total, payment) => total + payment.amount, 0)
}
