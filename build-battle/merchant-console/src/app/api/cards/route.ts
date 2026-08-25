import {
  cardByIdempotencyKey,
  issueCard,
  listCards,
  parseIssueRequest,
} from "@/data/cards"
import { NextRequest, NextResponse } from "next/server"

/**
 * Virtual cards (NWP-201).
 *
 * GET  — every issued card. Records carry `last4` only; there is no field on a
 *        card for a full number, so this response cannot leak one.
 * POST — issue a card. The full number appears in this response and nowhere
 *        else, ever. It is not stored and cannot be read back.
 */

export function GET() {
  return NextResponse.json({ cards: listCards() })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "Expected a JSON body." },
      { status: 400 },
    )
  }

  const parsed = parseIssueRequest(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { message: "Check the highlighted fields.", errors: parsed.errors },
      { status: 400 },
    )
  }

  // A retried request must not mint a second card. Ops clicking twice on a slow
  // connection is the exact scenario the wrong-limit incident came from.
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined
  if (idempotencyKey) {
    const existing = cardByIdempotencyKey(idempotencyKey)
    if (existing) {
      // 200, not 201 — nothing was created. The number is not replayed:
      // reveal-once means once, even on a retry.
      return NextResponse.json(
        { card: existing, alreadyIssued: true },
        { status: 200 },
      )
    }
  }

  const { card, fullNumber } = issueCard(parsed.value, new Date(), idempotencyKey)

  // The one and only time the full number is returned. Reveal once, mask forever.
  return NextResponse.json({ card, fullNumber }, { status: 201 })
}
