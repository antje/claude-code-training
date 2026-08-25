"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
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
 * Issue a card, then reveal its number exactly once. The number lives in state
 * only while the success panel is open and is dropped on close; the record has
 * no field for it, so it cannot be fetched back.
 */

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP"]

const CATEGORIES: Record<MerchantCategory, string> = {
  any: "Any category",
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  contractors: "Contractors",
}

const EMPTY = {
  nickname: "",
  merchantId: "",
  limit: "",
  currency: "USD" as Currency,
  category: "any" as MerchantCategory,
}

/** A labelled control with its own error slot. */
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-gray-900 dark:text-gray-50">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-sm text-red-600 dark:text-red-500" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  )
}

/** A labelled Select, since three of the four controls are one. */
function Choice({
  id,
  label,
  value,
  onChange,
  options,
  error,
  hint,
  disabled,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
  error?: string
  hint?: string
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full py-1.5" hasError={Boolean(error)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function IssueCardDialog({
  merchants,
}: {
  merchants: { id: string; name: string; currency: Currency }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ card: Card; fullNumber: string } | null>(null)
  const [copied, setCopied] = useState(false)

  /** One key per attempt: a double-click or retry reuses it, so no second card. */
  const [key, setKey] = useState(() => globalThis.crypto.randomUUID())

  const set = (patch: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...patch }))

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) return setKey(globalThis.crypto.randomUUID())
    // Closing drops the number from client state. Not recoverable.
    setForm(EMPTY)
    setErrors({})
    setFormError(null)
    setIssued(null)
    setCopied(false)
  }

  /** A card settles with its merchant, so choosing one fixes the currency. */
  const onMerchant = (id: string) => {
    const merchant = merchants.find((m) => m.id === id)
    set({ merchantId: id, ...(merchant ? { currency: merchant.currency } : {}) })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setFormError(null)

    // Convert once, at the boundary, with the existing helper.
    const spendLimit = parseAmountToMinorUnits(form.limit)
    if (spendLimit === null) {
      setErrors({ limit: "Enter an amount like 250 or 250.00." })
      setSubmitting(false)
      return
    }

    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ ...form, spendLimit }),
      })
      const payload = await response.json()

      if (!response.ok) {
        // The server is the enforcement; show what it objected to.
        const next: Record<string, string> = {}
        for (const e of payload.errors ?? [])
          next[e.field === "spendLimit" ? "limit" : e.field] = e.message
        setErrors(next)
        if (!payload.errors?.length)
          setFormError(payload.message ?? "Could not issue the card.")
        return
      }

      if (payload.alreadyIssued) {
        // A retry. The number is not replayed.
        setFormError(
          `Already issued as ${payload.card.nickname} (•••• ${payload.card.last4}). The full number was shown then and cannot be shown again.`,
        )
        router.refresh()
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DrawerTrigger>

      <DrawerContent className="sm:max-w-lg">
        {issued ? (
          <>
            <DrawerHeader>
              <DrawerTitle>Card issued</DrawerTitle>
              <DrawerDescription className="text-sm">
                {issued.card.nickname} is active and ready to use.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-400/10">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-500">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  This is the only time the full number is shown
                </p>
                <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-500/80">
                  It is not stored and cannot be looked up again. Copy it now if you
                  need it — everywhere else this card is •••• {issued.card.last4}.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                <span className="font-mono text-lg tabular-nums tracking-wide text-gray-900 dark:text-gray-50">
                  {issued.fullNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}
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
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button className="py-1.5">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle>Issue a virtual card</DrawerTitle>
              <DrawerDescription className="text-sm">
                Single merchant, virtual, with a spend limit from the moment it exists.
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="flex flex-col gap-4">
              <Field id="card-nickname" label="Nickname" error={errors.nickname}>
                <Input
                  id="card-nickname"
                  value={form.nickname}
                  onChange={(e) => set({ nickname: e.target.value })}
                  placeholder="Ad spend Q3"
                  hasError={Boolean(errors.nickname)}
                />
              </Field>

              <Choice
                id="card-merchant"
                label="Merchant"
                value={form.merchantId}
                onChange={onMerchant}
                options={merchants.map((m) => [m.id, m.name])}
                error={errors.merchantId}
                placeholder="Choose a merchant"
              />

              <div className="flex gap-3">
                <div className="flex-1">
                  <Field id="card-limit" label="Spend limit" error={errors.limit}>
                    <Input
                      id="card-limit"
                      inputMode="decimal"
                      value={form.limit}
                      onChange={(e) => set({ limit: e.target.value })}
                      placeholder="250.00"
                      hasError={Boolean(errors.limit)}
                    />
                  </Field>
                </div>
                <div className="w-32">
                  <Choice
                    id="card-currency"
                    label="Currency"
                    value={form.currency}
                    onChange={(v) => set({ currency: v as Currency })}
                    options={CURRENCIES.map((c) => [c, c])}
                    error={errors.currency}
                    hint={form.merchantId ? "Follows the merchant" : undefined}
                    disabled={Boolean(form.merchantId)}
                  />
                </div>
              </div>

              <Choice
                id="card-category"
                label="Category lock"
                value={form.category}
                onChange={(v) => set({ category: v as MerchantCategory })}
                options={Object.entries(CATEGORIES)}
              />

              {formError && (
                <p
                  className="flex items-start gap-2 text-sm text-red-600 dark:text-red-500"
                  role="alert"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {formError}
                </p>
              )}
            </DrawerBody>

            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="secondary" type="button" className="py-1.5">
                  Cancel
                </Button>
              </DrawerClose>
              <Button type="submit" className="py-1.5" disabled={submitting}>
                {submitting ? "Issuing…" : "Issue card"}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  )
}
