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
 * The validation boundary and the store rules. `src/lib/cards.test.ts` covers
 * the pure domain; this covers what the server refuses and what it records.
 */

// mch_01 Lumen Coffee Roasters settles USD.
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

/** Parse a request the tests know is valid, failing loudly if it is not. */
const requestFrom = (body: unknown = valid): IssueCardRequest => {
  const result = parseIssueRequest(body)
  if (!result.ok) throw new Error(`expected valid: ${JSON.stringify(result.errors)}`)
  return result.value
}

const issue = () => issueCard(requestFrom()).card

beforeEach(() => {
  store.cards.length = 0
})

describe("parseIssueRequest", () => {
  it("accepts a well-formed request and the exact ceiling", () => {
    expect(parseIssueRequest(valid).ok).toBe(true)
    expect(parseIssueRequest({ ...valid, spendLimit: MAX_SPEND_LIMIT }).ok).toBe(true)
  })

  it.each([
    ["missing merchant", { merchantId: undefined }, "merchantId"],
    ["unknown merchant", { merchantId: "mch_nope" }, "merchantId"],
    ["zero limit", { spendLimit: 0 }, "spendLimit"],
    ["negative limit", { spendLimit: -500 }, "spendLimit"],
    ["limit above the ceiling", { spendLimit: MAX_SPEND_LIMIT + 1 }, "spendLimit"],
    ["a float limit, not minor units", { spendLimit: 250.5 }, "spendLimit"],
    ["a string limit", { spendLimit: "25000" }, "spendLimit"],
    ["a currency outside the allowlist", { currency: "JPY" }, "currency"],
    ["a currency the merchant does not settle in", { currency: "EUR" }, "currency"],
    ["an empty nickname", { nickname: "" }, "nickname"],
  ])("rejects %s", (_label, patch, field) => {
    expect(fieldsIn({ ...valid, ...patch })).toContain(field)
  })

  it("accepts the currency the merchant does settle in", () => {
    const eur = store.merchants.find((m) => m.currency === "EUR")!
    expect(parseIssueRequest({ ...valid, merchantId: eur.id, currency: "EUR" }).ok).toBe(true)
  })

  it("collects every problem at once rather than stopping at the first", () => {
    expect(
      fieldsIn({ nickname: "", merchantId: "", spendLimit: -1, currency: "JPY" }),
    ).toEqual(
      expect.arrayContaining(["nickname", "merchantId", "spendLimit", "currency"]),
    )
  })

  it("falls back to 'any' for an unrecognised category rather than failing", () => {
    expect(requestFrom({ ...valid, category: "nonsense" }).category).toBe("any")
  })
})

describe("issueCard", () => {
  it("opens the history with the issue event", () => {
    const { history } = issue()
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ from: null, to: "active" })
  })

  it("gives consecutive cards distinct sequential ids", () => {
    const ids = [1, 2, 3].map(() => issue().id)
    expect(ids).toEqual(["crd_000001", "crd_000002", "crd_000003"])
    expect(new Set(ids).size).toBe(3)
  })

  it("never puts the full number on the record", () => {
    const { card, fullNumber } = issueCard(requestFrom())
    expect(JSON.stringify(card)).not.toContain(fullNumber)
    expect(card.last4).toBe(fullNumber.slice(-4))
  })
})

describe("idempotency", () => {
  it("finds a card issued under a key, and nothing for an unused one", () => {
    const { card } = issueCard(requestFrom(), new Date(), "key-abc")
    expect(cardByIdempotencyKey("key-abc")?.id).toBe(card.id)
    expect(cardByIdempotencyKey("never-used")).toBeNull()
  })

  it("keeps keys distinct between attempts", () => {
    issueCard(requestFrom(), new Date(), "key-1")
    issueCard(requestFrom(), new Date(), "key-2")
    expect(cardByIdempotencyKey("key-1")?.id).not.toBe(cardByIdempotencyKey("key-2")?.id)
  })
})

describe("setCardStatus", () => {
  it("records every accepted transition in the history", () => {
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
    expect(result.ok === false && result.reason).toBe("illegal_transition")
    expect(card.history).toHaveLength(before)
  })

  it("reports a missing card separately from an illegal move", () => {
    const result = setCardStatus("crd_nope", "frozen")
    expect(result.ok === false && result.reason).toBe("not_found")
  })
})
