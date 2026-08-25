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

/** Categories a card can be locked to at issue. */
export type MerchantCategory =
  | "advertising"
  | "software"
  | "travel"
  | "contractors"
  | "any"

/** Append-only; nothing is ever rewritten. */
export interface CardEvent {
  /** ISO 8601, always UTC. */
  at: string
  /** Null on the issue event — the card did not exist before it. */
  from: CardStatus | null
  to: CardStatus
}

/**
 * Deliberately **no field for the full card number**: it exists only in the
 * creation response, so there is nowhere for it to leak from later.
 */
export interface Card {
  id: string
  nickname: string
  merchantId: string
  /** The only digits that survive issue. */
  last4: string
  /** Opaque handle; not derivable from the digits. */
  reference: string
  /** Integer minor units. Never a float. */
  spendLimit: number
  currency: Currency
  status: CardStatus
  category: MerchantCategory
  /** ISO 8601, always UTC. */
  createdAt: string
  /** Every status held, oldest first — "what happened last Tuesday", no database. */
  history: CardEvent[]
  /** Lets a retried request return this card instead of minting a second. */
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
