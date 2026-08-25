export type Currency = "USD" | "EUR" | "GBP"

export type PaymentStatus =
  | "authorized"
  | "captured"
  | "refunded"
  | "failed"
  | "disputed"

export type DisputeStatus = "needs_response" | "under_review" | "won" | "lost"

export type PayoutStatus = "paid" | "in_transit" | "pending"

export interface Merchant {
  id: string
  name: string
  country: string
  /** IANA timezone. Display converts to this; storage never does. */
  timezone: string
  currency: Currency
  riskTier: "low" | "standard" | "elevated"
}

export interface Payment {
  id: string
  merchantId: string
  /** Integer minor units. Never a float. */
  amount: number
  currency: Currency
  status: PaymentStatus
  method: "card" | "wallet" | "bank_transfer"
  cardBrand: "visa" | "mastercard" | "amex" | null
  last4: string | null
  /** ISO 8601, always UTC. */
  createdAt: string
  description: string
}

export interface Refund {
  id: string
  paymentId: string
  amount: number
  currency: Currency
  reason: "requested_by_customer" | "duplicate" | "fraudulent"
  createdAt: string
}

export interface Dispute {
  id: string
  paymentId: string
  merchantId: string
  amount: number
  currency: Currency
  reasonCode: string
  status: DisputeStatus
  openedAt: string
  /** Evidence deadline, UTC. */
  evidenceDueAt: string
}

export interface Payout {
  id: string
  merchantId: string
  periodStart: string
  periodEnd: string
  gross: number
  fees: number
  net: number
  currency: Currency
  status: PayoutStatus
  paymentIds: string[]
}

/** Virtual card status. `active` and `frozen` interconvert; `cancelled` is terminal. */
export type CardStatus = "active" | "frozen" | "cancelled"

/** Spend categories a card can be locked to at issue time. */
export type MerchantCategory =
  | "advertising"
  | "software"
  | "travel"
  | "contractors"
  | "any"

/** One entry in a card's status history. Append-only; nothing is ever rewritten. */
export interface CardEvent {
  /** ISO 8601, always UTC. */
  at: string
  /** Null on the issue event — the card did not exist before it. */
  from: CardStatus | null
  to: CardStatus
}

/**
 * A virtual card.
 *
 * There is deliberately **no field for the full card number**. It exists only
 * in the creation response and is never stored, so there is nowhere for it to
 * leak from later. See `.claude/rules/cards.md`.
 */
export interface Card {
  id: string
  /** Human label ops gives the card, e.g. "Ad spend Q3". */
  nickname: string
  merchantId: string
  /** Last four of the generated number. The only digits that survive issue. */
  last4: string
  /** Opaque handle for the generated number. Not the number, not derivable from it. */
  reference: string
  /** Integer minor units. Never a float. */
  spendLimit: number
  currency: Currency
  status: CardStatus
  category: MerchantCategory
  /** ISO 8601, always UTC. */
  createdAt: string
  /**
   * Every status this card has held, oldest first, starting with its issue.
   * Answers "what happened to this card last Tuesday" without a database.
   */
  history: CardEvent[]
  /**
   * The idempotency key this card was issued under, if the caller sent one.
   * Lets a retried request return the existing card instead of a second one.
   */
  idempotencyKey?: string
}

export interface PaymentFilters {
  status?: PaymentStatus | "all"
  merchantId?: string
  search?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
  sort?: "createdAt" | "amount"
  direction?: "asc" | "desc"
}
