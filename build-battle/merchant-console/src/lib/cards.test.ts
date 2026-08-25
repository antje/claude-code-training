import { describe, expect, it } from "vitest"
import { CardStatus } from "@/data/types"
import {
  CARD_STATUSES,
  TEST_BIN,
  canTransition,
  cardReference,
  generateCardNumber,
  isLuhnValid,
  lastFour,
  luhnCheckDigit,
  maskCard,
  nextStatuses,
} from "./cards"

/**
 * The two things that must never regress: a generated number is a valid test
 * number on the 4242 BIN, and a cancelled card never comes back to life.
 */

describe("luhn", () => {
  it("completes the canonical test number", () => {
    expect(luhnCheckDigit("424242424242424")).toBe(2)
    expect(isLuhnValid("4242424242424242")).toBe(true)
  })

  it("rejects a transposed digit and non-digits", () => {
    expect(isLuhnValid("4242424242424243")).toBe(false)
    expect(isLuhnValid("4242-4242-4242-4242")).toBe(false)
    expect(isLuhnValid("")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  const numbers = Array.from({ length: 500 }, generateCardNumber)

  it("always starts with the 4242 test BIN", () => {
    for (const n of numbers) expect(n.startsWith(TEST_BIN), n).toBe(true)
  })

  it("always passes Luhn and is 16 digits", () => {
    for (const n of numbers) {
      expect(isLuhnValid(n), `${n} failed Luhn`).toBe(true)
      expect(n).toMatch(/^\d{16}$/)
    }
  })

  it("does not repeat itself", () => {
    expect(new Set(numbers).size).toBe(numbers.length)
  })
})

describe("masking", () => {
  it("keeps only the final four and hides the rest", () => {
    const n = generateCardNumber()
    expect(lastFour(n)).toBe(n.slice(-4))
    expect(maskCard(lastFour(n))).toBe(`•••• ${n.slice(-4)}`)
    expect(maskCard(lastFour(n))).not.toContain(n.slice(0, 12))
  })

  it("mints an opaque reference that leaks nothing", () => {
    const n = generateCardNumber()
    const ref = cardReference()
    expect(ref).toMatch(/^crd_ref_[0-9a-f]{16}$/)
    expect(ref).not.toContain(n.slice(-4))
    expect(new Set(Array.from({ length: 200 }, cardReference)).size).toBe(200)
  })
})

describe("state machine", () => {
  it("allows freeze, thaw and cancel from either live status", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal — nothing comes back from it", () => {
    for (const to of CARD_STATUSES) {
      expect(canTransition("cancelled", to), `cancelled → ${to}`).toBe(false)
    }
  })

  it("rejects a no-op and an unknown status", () => {
    for (const s of CARD_STATUSES) expect(canTransition(s, s), `${s} → ${s}`).toBe(false)
    expect(canTransition("active", "expired" as CardStatus)).toBe(false)
    expect(canTransition("nonsense" as CardStatus, "active")).toBe(false)
  })

  it("keeps nextStatuses and canTransition in agreement", () => {
    expect([...nextStatuses("active")].sort()).toEqual(["cancelled", "frozen"])
    expect(nextStatuses("cancelled")).toEqual([])
    for (const from of CARD_STATUSES) {
      for (const to of CARD_STATUSES) {
        expect(nextStatuses(from).includes(to)).toBe(canTransition(from, to))
      }
    }
  })
})
