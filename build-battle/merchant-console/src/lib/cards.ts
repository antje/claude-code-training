import { randomInt, randomUUID } from "crypto"
import { CardStatus } from "@/data/types"

/**
 * Card domain logic: pure, server-side, no store access. A card number
 * produced in the browser is a bug (`.claude/rules/cards.md`).
 */

/** The test BIN. Every generated number starts with it, so nothing resembles a real PAN. */
export const TEST_BIN = "4242"

/** 16 digits: 4 BIN + 11 random + 1 check digit. */
const LENGTH = 16

/**
 * The Luhn check digit for a partial number. Doubling starts at the partial's
 * rightmost digit, because the check digit takes the rightmost position.
 */
export function luhnCheckDigit(partial: string): number {
  let sum = 0
  let double = true
  for (let i = partial.length - 1; i >= 0; i--) {
    let digit = partial.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return (10 - (sum % 10)) % 10
}

/** Whether a complete number satisfies the Luhn checksum. */
export function isLuhnValid(number: string): boolean {
  if (!/^\d+$/.test(number)) return false
  return luhnCheckDigit(number.slice(0, -1)) === number.charCodeAt(number.length - 1) - 48
}

/**
 * Generate a number on the 4242 BIN with a valid check digit. Uses
 * `crypto.randomInt`, not `Math.random`: a predictable card number is a defect
 * even in a fixture.
 */
export function generateCardNumber(): string {
  let body = ""
  for (let i = 0; i < LENGTH - TEST_BIN.length - 1; i++) body += randomInt(0, 10)
  const partial = TEST_BIN + body
  return partial + luhnCheckDigit(partial)
}

/** The only digits that survive issue. */
export function lastFour(number: string): string {
  return number.slice(-4)
}

/** How a number is written anywhere but the creation response. */
export function maskCard(last4: string): string {
  return `•••• ${last4}`
}

/** An opaque handle for the generated number — not derived from its digits. */
export function cardReference(): string {
  return `crd_ref_${randomUUID().replace(/-/g, "").slice(0, 16)}`
}

/** `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal. */
const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export const CARD_STATUSES = Object.keys(TRANSITIONS) as CardStatus[]

/** Guarded on the server, not only in the UI. */
export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

/** What a card can legally move to now. Drives which buttons render. */
export function nextStatuses(from: CardStatus): readonly CardStatus[] {
  return TRANSITIONS[from] ?? []
}
