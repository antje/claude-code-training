import { describe, expect, it } from "vitest"
import { Payment } from "./types"
import { sortPayments } from "./queries"

/**
 * The amount comparator used to stringify both sides and compare the text, so
 * 994 ranked above 9873 — "9", "9", "4" beats "9", "8" one character in. Ops
 * looked for the largest payments and got small ones at the top for months.
 *
 * These amounts are chosen so a text comparison and a numeric one disagree.
 * Any of them reverting to string ordering fails this file.
 */

const base: Omit<Payment, "id" | "amount"> = {
  merchantId: "mch_01",
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order 1180",
}

/** $99.40, $98.73, $9.92, $1,000.00 — deliberately not in string order. */
const payment = (id: string, amount: number): Payment => ({ ...base, id, amount })

const payments: Payment[] = [
  payment("pay_small", 992),
  payment("pay_large", 100000),
  payment("pay_mid", 9873),
  payment("pay_midplus", 9940),
]

const ids = (rows: Payment[]) => rows.map((p) => p.id)

describe("sortPayments by amount", () => {
  it("puts the largest amount first when descending", () => {
    expect(ids(sortPayments(payments, "amount", "desc"))).toEqual([
      "pay_large",
      "pay_midplus",
      "pay_mid",
      "pay_small",
    ])
  })

  it("puts the smallest amount first when ascending", () => {
    expect(ids(sortPayments(payments, "amount", "asc"))).toEqual([
      "pay_small",
      "pay_mid",
      "pay_midplus",
      "pay_large",
    ])
  })

  it("does not rank a shorter number above a longer one", () => {
    // The exact shape of the bug: 994 as text sorts above 9873.
    const rows = sortPayments(
      [payment("pay_994", 994), payment("pay_9873", 9873)],
      "amount",
      "desc",
    )
    expect(ids(rows)).toEqual(["pay_9873", "pay_994"])
  })

  it("orders amounts numerically across an order of magnitude", () => {
    const rows = sortPayments(
      [9, 100, 25, 1000, 3].map((a, i) => payment(`pay_${i}`, a)),
      "amount",
      "desc",
    )
    expect(rows.map((p) => p.amount)).toEqual([1000, 100, 25, 9, 3])
  })

  it("leaves the input array untouched", () => {
    const before = ids(payments)
    sortPayments(payments, "amount", "desc")
    expect(ids(payments)).toEqual(before)
  })
})

describe("sortPayments by createdAt", () => {
  it("still sorts newest first by default", () => {
    const rows = sortPayments(
      [
        { ...payment("pay_old", 100), createdAt: "2026-01-01T00:00:00.000Z" },
        { ...payment("pay_new", 100), createdAt: "2026-08-13T00:00:00.000Z" },
      ],
      "createdAt",
      "desc",
    )
    expect(ids(rows)).toEqual(["pay_new", "pay_old"])
  })
})
