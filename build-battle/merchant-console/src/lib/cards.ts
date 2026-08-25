import { randomInt, randomUUID } from "crypto"
import { CardStatus } from "@/data/types"

/**
 * Card domain logic. Pure functions, no store access, no React.
 *
 * Everything generated here runs on the server. A card number produced in the
 * browser is a bug (`.claude/rules/cards.md`), so nothing in this file may be
 * imported into a client component.
 */

/** The test BIN. Every generated number starts with it, so nothing here can resemble a real PAN. */
export const TEST_BIN = "4242"

/** Generated numbers are 16 digits: 4 BIN + 11 random + 1 Luhn check digit. */
const CARD_NUMBER_LENGTH = 16

/**
 * The Luhn check digit for a partial number.
 *
 * Doubles every second digit from the right of the *completed* number, which —
 * because the check digit occupies the rightmost position — means doubling
 * starts at the rightmost digit of the partial.
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
  const body = number.slice(0, -1)
  const check = number.charCodeAt(number.length - 1) - 48
  return luhnCheckDigit(body) === check
}

/**
 * Generate a card number on the 4242 test BIN with a valid Luhn check digit.
 *
 * Uses `crypto.randomInt` rather than `Math.random`: these are card numbers,
 * and a predictable sequence is a defect even in a fixture.
 */
export function generateCardNumber(): string {
  const bodyLength = CARD_NUMBER_LENGTH - TEST_BIN.length - 1
  let body = ""
  for (let i = 0; i < bodyLength; i++) body += randomInt(0, 10)
  const partial = TEST_BIN + body
  return partial + luhnCheckDigit(partial)
}

/** The last four digits of a number. The only digits that survive issue. */
export function lastFour(number: string): string {
  return number.slice(-4)
}

/** How a card number is written anywhere other than the creation response. */
export function maskCard(last4: string): string {
  return `•••• ${last4}`
}

/**
 * An opaque handle for a generated number.
 *
 * Stored on the card so a support agent can reference "the number we issued"
 * without the number existing anywhere. Not derived from the digits, so it
 * leaks nothing about them.
 */
export function cardReference(): string {
  return `crd_ref_${randomUUID().replace(/-/g, "").slice(0, 16)}`
}

/**
 * The status state machine, as data.
 *
 * `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal —
 * nothing comes back from it.
 */
const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export const CARD_STATUSES = Object.keys(TRANSITIONS) as CardStatus[]

/** Whether a status change is legal. Guarded on the server, not only in the UI. */
export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

/** The statuses a card can legally move to right now. Drives which buttons render. */
export function nextStatuses(from: CardStatus): readonly CardStatus[] {
  return TRANSITIONS[from] ?? []
}
