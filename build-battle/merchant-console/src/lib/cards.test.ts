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

describe("luhnCheckDigit", () => {
  it("computes the digit that completes a known test number", () => {
    // 4242424242424242 is the canonical test PAN; its body is 424242424242424.
    expect(luhnCheckDigit("424242424242424")).toBe(2)
  })

  it("returns a single digit for any partial", () => {
    for (const partial of ["4242", "0", "9".repeat(15), "4242000000000"]) {
      const digit = luhnCheckDigit(partial)
      expect(digit).toBeGreaterThanOrEqual(0)
      expect(digit).toBeLessThanOrEqual(9)
    }
  })
})

describe("isLuhnValid", () => {
  it("accepts the canonical test number", () => {
    expect(isLuhnValid("4242424242424242")).toBe(true)
  })

  it("rejects a number with a single transposed digit", () => {
    expect(isLuhnValid("4242424242424243")).toBe(false)
  })

  it("rejects anything that is not all digits", () => {
    expect(isLuhnValid("4242-4242-4242-4242")).toBe(false)
    expect(isLuhnValid("")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  it("always starts with the 4242 test BIN, so nothing here resembles a real PAN", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateCardNumber().startsWith(TEST_BIN)).toBe(true)
    }
  })

  it("always passes the Luhn check", () => {
    for (let i = 0; i < 500; i++) {
      const number = generateCardNumber()
      expect(isLuhnValid(number), `${number} failed Luhn`).toBe(true)
    }
  })

  it("is always 16 digits", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateCardNumber()).toMatch(/^\d{16}$/)
    }
  })

  it("does not repeat itself", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(generateCardNumber())
    expect(seen.size).toBe(500)
  })
})

describe("lastFour and maskCard", () => {
  it("keeps only the final four digits", () => {
    expect(lastFour("4242424242421234")).toBe("1234")
  })

  it("writes a masked number the way the rest of the app shows it", () => {
    expect(maskCard("1234")).toBe("•••• 1234")
  })

  it("never includes the leading digits in the mask", () => {
    const number = generateCardNumber()
    const masked = maskCard(lastFour(number))
    expect(masked).not.toContain(number.slice(0, 12))
    expect(masked).toBe(`•••• ${number.slice(-4)}`)
  })
})

describe("cardReference", () => {
  it("is opaque — it leaks nothing about the number", () => {
    const number = generateCardNumber()
    const reference = cardReference()
    expect(reference).toMatch(/^crd_ref_[0-9a-f]{16}$/)
    expect(reference).not.toContain(number.slice(-4))
  })

  it("is unique per call", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(cardReference())
    expect(seen.size).toBe(200)
  })
})

describe("canTransition", () => {
  it("lets an active card freeze and a frozen card thaw", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
  })

  it("lets either live status cancel", () => {
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal — nothing comes back from it", () => {
    for (const to of CARD_STATUSES) {
      expect(canTransition("cancelled", to), `cancelled → ${to}`).toBe(false)
    }
  })

  it("rejects a no-op transition to the same status", () => {
    for (const status of CARD_STATUSES) {
      expect(canTransition(status, status), `${status} → ${status}`).toBe(false)
    }
  })

  it("rejects a status that is not part of the machine", () => {
    expect(canTransition("active", "expired" as CardStatus)).toBe(false)
    expect(canTransition("nonsense" as CardStatus, "active")).toBe(false)
  })
})

describe("nextStatuses", () => {
  it("offers freeze and cancel on an active card", () => {
    expect([...nextStatuses("active")].sort()).toEqual(["cancelled", "frozen"])
  })

  it("offers nothing on a cancelled card", () => {
    expect(nextStatuses("cancelled")).toEqual([])
  })

  it("agrees with canTransition for every pair", () => {
    for (const from of CARD_STATUSES) {
      for (const to of CARD_STATUSES) {
        expect(nextStatuses(from).includes(to)).toBe(canTransition(from, to))
      }
    }
  })
})
