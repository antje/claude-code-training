"use client"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/Dialog"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { Card, Currency, MerchantCategory } from "@/data/types"
import { parseAmountToMinorUnits } from "@/lib/money"
import { Check, Copy, Plus, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Issue a virtual card, then reveal its number exactly once.
 *
 * The number lives in this component's state only while the success screen is
 * open, and is dropped when it closes. It is never written anywhere else and
 * cannot be fetched back — the card record has no field for it.
 */

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP"]

const CATEGORY_LABELS: Record<MerchantCategory, string> = {
  any: "Any category",
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  contractors: "Contractors",
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as MerchantCategory[]

type FieldErrors = Record<string, string>

export function IssueCardDialog({
  merchants,
}: {
  merchants: { id: string; name: string; currency: Currency }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [category, setCategory] = useState<MerchantCategory>("any")

  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  /** Set only on success, cleared when the dialog closes. The one-time reveal. */
  const [issued, setIssued] = useState<{ card: Card; fullNumber: string } | null>(
    null,
  )
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setNickname("")
    setMerchantId("")
    setLimit("")
    setCurrency("USD")
    setCategory("any")
    setErrors({})
    setFormError(null)
    setIssued(null)
    setCopied(false)
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    // Closing drops the full number from client state. It is not recoverable.
    if (!next) reset()
  }

  /** Picking a merchant defaults the currency to the one they settle in. */
  const onMerchantChange = (id: string) => {
    setMerchantId(id)
    const merchant = merchants.find((m) => m.id === id)
    if (merchant) setCurrency(merchant.currency)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setFormError(null)

    // Convert at the boundary, once, with the helper that already exists.
    const minorUnits = parseAmountToMinorUnits(limit)
    if (minorUnits === null) {
      setErrors({ spendLimit: "Enter an amount like 250 or 250.00." })
      setSubmitting(false)
      return
    }

    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname,
          merchantId,
          spendLimit: minorUnits,
          currency,
          category,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        // The server is the enforcement; show exactly what it objected to.
        const next: FieldErrors = {}
        for (const error of payload.errors ?? []) next[error.field] = error.message
        setErrors(next)
        setFormError(
          payload.errors?.length ? null : (payload.message ?? "Could not issue the card."),
        )
        return
      }

      setIssued({ card: payload.card, fullNumber: payload.fullNumber })
      router.refresh()
    } catch {
      setFormError("Could not reach the server. Nothing was issued — try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const grouped = (formatted: string) =>
    formatted.replace(/(\d{4})(?=\d)/g, "$1 ")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>Card issued</DialogTitle>
              <DialogDescription className="text-sm">
                {issued.card.nickname} is active and ready to use.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-400/10">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-500">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                This is the only time the full number is shown
              </p>
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-500/80">
                It is not stored and cannot be looked up again. Copy it now if
                you need it — everywhere else this card is •••• {issued.card.last4}.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <span className="font-mono text-lg tabular-nums tracking-wide text-gray-900 dark:text-gray-50">
                {grouped(issued.fullNumber)}
              </span>
              <Button
                variant="secondary"
                className="shrink-0 gap-2 py-1.5"
                onClick={() => {
                  navigator.clipboard?.writeText(issued.fullNumber)
                  setCopied(true)
                }}
              >
                {copied ? (
                  <Check className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Copy className="size-4 shrink-0" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button className="py-1.5">Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Issue a virtual card</DialogTitle>
              <DialogDescription className="text-sm">
                Single merchant, virtual, with a spend limit from the moment it
                exists.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 flex flex-col gap-4">
              <div>
                <label
                  htmlFor="card-nickname"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Nickname
                </label>
                <Input
                  id="card-nickname"
                  name="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Ad spend Q3"
                  className="mt-1.5"
                  hasError={Boolean(errors.nickname)}
                />
                {errors.nickname && <FieldMessage>{errors.nickname}</FieldMessage>}
              </div>

              <div>
                <label
                  htmlFor="card-merchant"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Merchant
                </label>
                <Select value={merchantId} onValueChange={onMerchantChange}>
                  <SelectTrigger
                    id="card-merchant"
                    className="mt-1.5 w-full py-1.5"
                    hasError={Boolean(errors.merchantId)}
                  >
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.merchantId && (
                  <FieldMessage>{errors.merchantId}</FieldMessage>
                )}
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="card-limit"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Spend limit
                  </label>
                  <Input
                    id="card-limit"
                    name="spendLimit"
                    inputMode="decimal"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="250.00"
                    className="mt-1.5"
                    hasError={Boolean(errors.spendLimit)}
                  />
                </div>
                <div className="w-32">
                  <label
                    htmlFor="card-currency"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Currency
                  </label>
                  <Select
                    value={currency}
                    onValueChange={(v) => setCurrency(v as Currency)}
                  >
                    <SelectTrigger
                      id="card-currency"
                      className="mt-1.5 w-full py-1.5"
                      hasError={Boolean(errors.currency)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(errors.spendLimit || errors.currency) && (
                <FieldMessage>{errors.spendLimit ?? errors.currency}</FieldMessage>
              )}

              <div>
                <label
                  htmlFor="card-category"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Category lock
                </label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as MerchantCategory)}
                >
                  <SelectTrigger id="card-category" className="mt-1.5 w-full py-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formError && (
                <p
                  className="flex items-center gap-2 text-sm text-red-600 dark:text-red-500"
                  role="alert"
                >
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  {formError}
                </p>
              )}
            </div>

            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button variant="secondary" type="button" className="py-1.5">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" className="py-1.5" disabled={submitting}>
                {submitting ? "Issuing…" : "Issue card"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FieldMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-sm text-red-600 dark:text-red-500" role="alert">
      {children}
    </p>
  )
}
