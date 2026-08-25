import { describe, expect, it } from "vitest"
import { Payment } from "@/data/types"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  exportFilename,
  parseColumns,
  parseScope,
  toCsv,
} from "./csv"

/**
 * The export is the file ops hands to a merchant, so a broken cell is a
 * support ticket rather than a stack trace. These tests pin the escaping and
 * the column contract; NWP-101 changes which columns ship, not how a cell is
 * written, and these should still pass afterwards.
 */

const payment: Payment = {
  id: "pay_0001",
  merchantId: "mch_01",
  amount: 25000,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order 1180",
}

describe("toCsv", () => {
  it("writes a header row followed by one row per payment", () => {
    const lines = toCsv([payment]).split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","))
  })

  it("writes only the requested columns, in the order given", () => {
    expect(toCsv([payment], ["id", "amount"])).toBe(
      ["id,amount", "pay_0001,$250.00"].join("\n"),
    )
  })

  it("quotes cells containing a comma, so amounts do not split", () => {
    const large = { ...payment, amount: 123456789 }
    expect(toCsv([large], ["amount"])).toBe(['amount', '"$1,234,567.89"'].join("\n"))
  })

  it("doubles embedded quotes rather than dropping them", () => {
    const quoted = { ...payment, description: 'Order "rush"' }
    expect(toCsv([quoted], ["description"])).toBe(
      ["description", '"Order ""rush"""'].join("\n"),
    )
  })

  it("keeps a newline inside a description in one quoted cell", () => {
    const multiline = { ...payment, description: "Order 1180\nsecond line" }
    const body = toCsv([multiline], ["description"]).split("\n").slice(1).join("\n")
    expect(body).toBe('"Order 1180\nsecond line"')
  })

  it("resolves the merchant name, and falls back to the id when unknown", () => {
    expect(toCsv([payment], ["merchant"])).toContain("Lumen Coffee Roasters")
    const orphan = { ...payment, merchantId: "mch_missing" }
    expect(toCsv([orphan], ["merchant"])).toContain("mch_missing")
  })

  it("writes an empty cell for a payment with no card", () => {
    const bank: Payment = {
      ...payment,
      method: "bank_transfer",
      cardBrand: null,
      last4: null,
    }
    expect(toCsv([bank], ["card_brand", "last4"])).toBe(
      ["card_brand,last4", ","].join("\n"),
    )
  })

  it("emits a header even with no rows", () => {
    expect(toCsv([], ["id"])).toBe("id")
  })
})

describe("parseColumns", () => {
  it("leaves the card last four out of the default set", () => {
    expect(parseColumns(null)).toEqual([...DEFAULT_EXPORT_COLUMNS])
    expect(parseColumns(null)).not.toContain("last4")
  })

  it("keeps every other column in the default set", () => {
    expect(parseColumns(null)).toEqual(
      EXPORT_COLUMNS.filter((column) => column !== "last4"),
    )
  })

  it("returns the requested subset in the order it was asked for", () => {
    expect(parseColumns("amount,id,merchant")).toEqual([
      "amount",
      "id",
      "merchant",
    ])
  })

  it("includes the card last four when ops explicitly asks for it", () => {
    expect(parseColumns("id,last4")).toEqual(["id", "last4"])
  })

  it("drops names that are not columns rather than passing them through", () => {
    expect(parseColumns("id,../../etc/passwd,amount")).toEqual(["id", "amount"])
    expect(parseColumns("id,createdAt,AMOUNT")).toEqual(["id"])
  })

  it("collapses duplicates so a column is never written twice", () => {
    expect(parseColumns("id,amount,id")).toEqual(["id", "amount"])
  })

  it("tolerates whitespace around names", () => {
    expect(parseColumns(" id , amount ")).toEqual(["id", "amount"])
  })

  it("returns nothing for an empty selection, rather than falling back to the default", () => {
    expect(parseColumns("")).toEqual([])
    expect(parseColumns("nope,also_nope")).toEqual([])
  })
})

describe("parseScope", () => {
  it("defaults to the current filter", () => {
    expect(parseScope(null)).toBe("filtered")
    expect(parseScope("everything")).toBe("filtered")
  })

  it("accepts the two scopes ops can choose", () => {
    expect(parseScope("filtered")).toBe("filtered")
    expect(parseScope("all")).toBe("all")
  })
})

describe("toCsv with a chosen column set", () => {
  it("writes the default set, so no card digits leave in an unasked-for file", () => {
    const header = toCsv([payment], parseColumns(null)).split("\n")[0]
    expect(header).not.toContain("last4")
    expect(header).toBe(DEFAULT_EXPORT_COLUMNS.join(","))
  })

  it("writes a subset in the requested order, not the declaration order", () => {
    expect(toCsv([payment], parseColumns("amount,id"))).toBe(
      ["amount,id", "$250.00,pay_0001"].join("\n"),
    )
  })

  it("keeps the amount in minor units until the edge, with currency in its own column", () => {
    expect(payment.amount).toBe(25000)
    expect(toCsv([payment], ["amount", "currency"])).toBe(
      ["amount,currency", "$250.00,USD"].join("\n"),
    )
  })
})

describe("exportFilename", () => {
  it("stamps the UTC date, so two exports on the same day collide by design", () => {
    expect(exportFilename(new Date("2026-03-14T23:00:00.000Z"))).toBe(
      "payments-2026-03-14.csv",
    )
  })

  it("names the scope when the export is not the whole unfiltered table", () => {
    expect(exportFilename(new Date("2026-08-13T09:00:00.000Z"), "disputed")).toBe(
      "payments-disputed-2026-08-13.csv",
    )
    expect(exportFilename(new Date("2026-08-13T09:00:00.000Z"), "all")).toBe(
      "payments-all-2026-08-13.csv",
    )
  })

  it("slugs the scope segment, so nothing odd reaches the header", () => {
    expect(
      exportFilename(new Date("2026-08-13T09:00:00.000Z"), 'needs response"'),
    ).toBe("payments-needs-response-2026-08-13.csv")
  })

  it("falls back to the plain name for an empty scope", () => {
    expect(exportFilename(new Date("2026-08-13T09:00:00.000Z"), "")).toBe(
      "payments-2026-08-13.csv",
    )
  })
})
