import { Divider } from "@/components/Divider"
import { CardStatusBadge } from "@/components/ui/cards/CardStatusBadge"
import { cardById, cardSpend } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { CardStatus, MerchantCategory } from "@/data/types"
import { maskCard } from "@/lib/cards"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CardActions } from "../card-actions"

const CATEGORIES: Record<MerchantCategory, string> = {
  any: "Any category",
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  contractors: "Contractors",
}

const STATUSES: Record<CardStatus, string> = {
  active: "Active",
  frozen: "Frozen",
  cancelled: "Cancelled",
}

/** Past this share of the limit the bar turns amber. */
const WARN_AT = 0.8

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)
  const zone = merchant?.timezone ?? "UTC"
  const spent = cardSpend(card)
  const ratio = card.spendLimit > 0 ? spent / card.spendLimit : 0
  const percent = Math.min(100, Math.round(ratio * 100))
  const over = spent > card.spendLimit
  const warn = ratio >= WARN_AT

  const tone = over
    ? { text: "text-red-600 dark:text-red-500", bar: "bg-red-500" }
    : warn
      ? { text: "text-amber-600 dark:text-amber-500", bar: "bg-amber-500" }
      : { text: "text-gray-500", bar: "bg-emerald-600 dark:bg-emerald-400" }

  const facts: [string, string, boolean?][] = [
    ["Card ID", card.id, true],
    ["Merchant", merchant?.name ?? card.merchantId],
    ["Number", maskCard(card.last4), true],
    ["Reference", card.reference, true],
    ["Spend limit", formatMoney(card.spendLimit, card.currency)],
    ["Currency", card.currency],
    ["Category lock", CATEGORIES[card.category]],
    ["Issued", formatInZone(card.createdAt, zone)],
  ]

  return (
    <section aria-label={`Card ${card.nickname}`} className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        All cards
      </Link>

      <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
              {card.nickname}
            </h1>
            <CardStatusBadge status={card.status} />
          </div>
          <p className="mt-1 font-mono tabular-nums text-gray-500">
            {maskCard(card.last4)}
          </p>
        </div>
        <CardActions id={card.id} status={card.status} />
      </div>

      <Divider />

      <div className="rounded-md border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Spend against limit</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
              {formatMoney(spent, card.currency)}
              <span className="ml-1.5 text-base font-normal text-gray-500">
                of {formatMoney(card.spendLimit, card.currency)}
              </span>
            </p>
          </div>
          <p className={cx("text-sm font-medium tabular-nums", tone.text)}>
            {percent}%
          </p>
        </div>

        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Spend against limit"
        >
          <div
            className={cx("h-full rounded-full transition-all", tone.bar)}
            style={{ width: `${percent}%` }}
          />
        </div>

        {over ? (
          <p className={cx("mt-2 text-sm", tone.text)} role="alert">
            Spend has passed the limit. Freeze the card if this was not expected.
          </p>
        ) : warn ? (
          <p className={cx("mt-2 text-sm", tone.text)}>
            Past {Math.round(WARN_AT * 100)}% of the limit.
          </p>
        ) : null}

        <p className="mt-2 text-xs text-gray-500">
          Spend is this merchant&rsquo;s captured {card.currency} volume. Cards
          carry their own transactions from NWP-203.
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {facts.map(([label, value, mono]) => (
          <div key={label}>
            <dt className="text-sm text-gray-500">{label}</dt>
            <dd
              className={cx(
                "mt-0.5 text-sm text-gray-900 dark:text-gray-50",
                mono && "font-mono tabular-nums",
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-8" aria-label="Status history">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-50">
          History
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Every status this card has held. Append-only — nothing is rewritten.
        </p>
        <ol className="mt-3 border-l border-gray-200 dark:border-gray-800">
          {[...card.history].reverse().map((event, i) => (
            <li key={`${event.at}-${i}`} className="relative py-2 pl-5 text-sm">
              <span
                className="absolute -left-[3px] top-3.5 size-1.5 rounded-full bg-gray-400 dark:bg-gray-600"
                aria-hidden="true"
              />
              <span className="text-gray-900 dark:text-gray-50">
                {event.from === null
                  ? "Issued"
                  : `${STATUSES[event.from]} → ${STATUSES[event.to]}`}
              </span>
              <span className="ml-2 text-gray-500">
                {formatInZone(event.at, zone)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-6 text-xs text-gray-500">
        The full number was shown once, when this card was issued. It is not
        stored and cannot be retrieved.
      </p>
    </section>
  )
}
