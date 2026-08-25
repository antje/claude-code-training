import { beforeEach, describe, expect, it } from "vitest"
import { store } from "./store"
import type { IssueCardRequest } from "./cards"
import {
  MAX_SPEND_LIMIT,
  cardByIdempotencyKey,
  issueCard,
  parseIssueRequest,
  setCardStatus,
} from "./cards"

/**
 * The validation boundary and the store rules.
 *
 * `src/lib/cards.test.ts` covers the pure card domain (Luhn, BIN, transitions);
 * this file covers what the server refuses and what it records.
 */

// mch_01 Lumen Coffee Roasters settles USD; mch_06 Nordwind Fahrrad settles EUR.
const valid = {
  nickname: "Ad spend Q3",
  merchantId: "mch_01",
  spendLimit: 25000,
  currency: "USD",
  category: "advertising",
}

const fieldsIn = (body: unknown) => {
  const result = parseIssueRequest(body)
  return result.ok ? [] : result.errors.map((e) => e.field)
}

/** Parse a request the tests know is valid, and fail loudly if it is not. */
const requestFrom = (body: unknown): IssueCardRequest => {
  const result = parseIssueRequest(body)
  if (!result.ok) {
    throw new Error(`expected a valid request, got: ${JSON.stringify(result.errors)}`)
  }
  return result.value
}

beforeEach(() => {
  store.cards.length = 0
})

describe("parseIssueRequest", () => {
  it("accepts a well-formed request", () => {
    const result = parseIssueRequest(valid)
    expect(result.ok).toBe(true)
  })

  it("rejects a missing merchant", () => {
    expect(fieldsIn({ ...valid, merchantId: undefined })).toContain("merchantId")
  })

  it("rejects an unknown merchant", () => {
    expect(fieldsIn({ ...valid, merchantId: "mch_nope" })).toContain("merchantId")
  })

  it("rejects a zero or negative limit", () => {
    expect(fieldsIn({ ...valid, spendLimit: 0 })).toContain("spendLimit")
    expect(fieldsIn({ ...valid, spendLimit: -500 })).toContain("spendLimit")
  })

  it("rejects a limit above the ceiling", () => {
    expect(fieldsIn({ ...valid, spendLimit: MAX_SPEND_LIMIT + 1 })).toContain(
      "spendLimit",
    )
    expect(parseIssueRequest({ ...valid, spendLimit: MAX_SPEND_LIMIT }).ok).toBe(
      true,
    )
  })

  it("rejects a limit that is not integer minor units", () => {
    expect(fieldsIn({ ...valid, spendLimit: 250.5 })).toContain("spendLimit")
    expect(fieldsIn({ ...valid, spendLimit: "25000" })).toContain("spendLimit")
  })

  it("rejects a currency outside USD, EUR and GBP", () => {
    expect(fieldsIn({ ...valid, currency: "JPY" })).toContain("currency")
  })

  it("rejects a currency the merchant does not settle in", () => {
    // Lumen Coffee Roasters settles USD; a EUR card for them is a mismatch.
    const errors = fieldsIn({ ...valid, currency: "EUR" })
    expect(errors).toContain("currency")
  })

  it("accepts the currency the merchant does settle in", () => {
    const merchant = store.merchants.find((m) => m.currency === "EUR")!
    const result = parseIssueRequest({
      ...valid,
      merchantId: merchant.id,
      currency: "EUR",
    })
    expect(result.ok).toBe(true)
  })

  it("collects every problem at once rather than stopping at the first", () => {
    const errors = fieldsIn({
      nickname: "",
      merchantId: "",
      spendLimit: -1,
      currency: "JPY",
    })
    expect(errors).toEqual(
      expect.arrayContaining(["nickname", "merchantId", "spendLimit", "currency"]),
    )
  })

  it("falls back to 'any' for an unrecognised category rather than failing", () => {
    const result = parseIssueRequest({ ...valid, category: "nonsense" })
    expect(result.ok && result.value.category).toBe("any")
  })
})

describe("issueCard", () => {
  it("opens the history with the issue event", () => {
    const { card } = issueCard(requestFrom(valid))
    expect(card.history).toHaveLength(1)
    expect(card.history[0].from).toBeNull()
    expect(card.history[0].to).toBe("active")
  })

  it("gives consecutive cards distinct sequential ids", () => {
    const request = requestFrom(valid)
    const ids = [1, 2, 3].map(() => issueCard(request).card.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).toEqual(["crd_000001", "crd_000002", "crd_000003"])
  })

  it("never puts the full number on the record", () => {
    const request = requestFrom(valid)
    const { card, fullNumber } = issueCard(request)
    expect(JSON.stringify(card)).not.toContain(fullNumber)
    expect(card.last4).toBe(fullNumber.slice(-4))
  })
})

describe("idempotency", () => {
  it("finds a card issued under a key", () => {
    const request = requestFrom(valid)
    const { card } = issueCard(request, new Date(), "key-abc")
    expect(cardByIdempotencyKey("key-abc")?.id).toBe(card.id)
  })

  it("returns nothing for an unused key", () => {
    expect(cardByIdempotencyKey("never-used")).toBeNull()
  })

  it("keeps keys distinct between attempts", () => {
    const request = requestFrom(valid)
    issueCard(request, new Date(), "key-1")
    issueCard(request, new Date(), "key-2")
    expect(cardByIdempotencyKey("key-1")?.id).not.toBe(
      cardByIdempotencyKey("key-2")?.id,
    )
  })
})

describe("setCardStatus", () => {
  const issue = () => issueCard(requestFrom(valid)).card

  it("records every transition in the history", () => {
    const card = issue()
    setCardStatus(card.id, "frozen")
    setCardStatus(card.id, "active")
    expect(card.history.map((e) => e.to)).toEqual(["active", "frozen", "active"])
    expect(card.history[1].from).toBe("active")
  })

  it("refuses to resurrect a cancelled card and records nothing", () => {
    const card = issue()
    setCardStatus(card.id, "cancelled")
    const before = card.history.length
    const result = setCardStatus(card.id, "active")
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe("illegal_transition")
    expect(card.history).toHaveLength(before)
  })

  it("reports a missing card separately from an illegal move", () => {
    const result = setCardStatus("crd_nope", "frozen")
    expect(result.ok === false && result.reason).toBe("not_found")
  })
})
