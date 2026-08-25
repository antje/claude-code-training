---
name: northwind-pr
description: Write a pull request description in the Northwind Payments house format — ticket ID in the title, what changed in plain language, how it was verified with the real commands and their real output, acceptance criteria ticked honestly, and what was deliberately left undone. Use whenever a PR description is being written, rewritten, or bounced back for its description, on any Northwind branch.
---

# northwind-pr

Marcus sends pull requests back over the description more often than the code.
This is his format. It is not negotiable and it is not long — the whole point is
that nobody should have to retype it from memory and get it slightly wrong.

## Gather the facts first. Never write from memory.

Run these before writing a single line. If a command fails, say so; do not
substitute a guess.

```bash
git branch --show-current                 # the ticket ID lives here
git log main..HEAD --oneline              # how the work was sequenced
git diff main...HEAD --stat               # the shape of the change
git diff main...HEAD                      # what actually changed
```

Then read, in this order:

1. `docs/tickets/<TICKET-ID>.md` — the acceptance criteria, **verbatim**. Copy the
   checkbox lines; do not paraphrase them into something easier to tick.
2. `docs/epics/<TICKET-ID>-*.md`, if one exists — what was planned, and every
   place the build departed from it. A departure is a note for the reviewer, not
   something to hide.
3. `.github/pull_request_template.md` — the sections and their order.

If the branch name carries no ticket ID, ask which ticket this is. Do not invent one.

## The format

### Title

```
<TICKET-ID>: <what it does>
```

Lowercase after the colon, imperative or plain descriptive, no trailing period.
`NWP-101: add export options` — not "Implemented export options functionality".

### What changed

**One paragraph, plain language, no file list.** The diff is already a file list.
Answer the only question the reviewer has at this point: what can the app do now
that it could not do before, and for whom?

> Ops can now choose which columns go into a payments export and whether it
> covers the current filter or every payment, with the row count shown before
> they download.

Not:

> Implemented column selection functionality in the export module.

If the change is invisible to a user — a refactor, a helper, a test — say who it
is for instead: the next person to touch this file, the on-call engineer, CI.

### How I verified it

**The commands actually run, and what they actually printed.** Paste the summary
line; do not retype it from memory.

- Good: `` `npm test` — Test Files 3 passed (3) / Tests 44 passed (44) ``
- Weak: "tests pass"
- Disqualifying: a command that was never run

Cover, where each applies:

- The test run, with its summary line
- `npm run lint`, `npx tsc --noEmit`, `npm run build` — the checks a reviewer would run
- What was clicked in the browser and what appeared on screen, specifically:
  the URL, the control, the result. "Checked it in the browser" is not evidence.
- Any `curl` against a route, with the parameters and the response

Then tick the template's checkboxes to match — and only to match.

### Acceptance criteria

Copy the ticket's checkbox lines verbatim and go through them one at a time.
For each, find the code that satisfies it, or find that nothing does.

- Met → `[x]`
- Not met → `[ ]`, and one line on what is missing
- Partial → `[ ]`, and say **which half** is done

An unmet criterion reported honestly reads better than an unmet criterion left
out, because the reviewer finds it either way — and one of those looks like a
mistake while the other looks like a lie.

### Deliberately not done

Everything out of scope or left for a follow-up, each with its reason and, where
there is one, the ticket it belongs to instead. Stretch goals not reached,
known rough edges, the test that was meant to be written.

Stating a limit is not a weakness in a pull request. Discovering it is.

### Bugs fixed along the way

Anything found beyond the ticket. Name the file, the line, and the **root cause** —
not the symptom. If a defect was found and deliberately not fixed on this branch,
it belongs here too, marked as not fixed, with the reason.

### Notes for the reviewer

What would be said out loud in a review: trade-offs, a convention that had to be
bent, a new dependency or primitive and why it was unavoidable, an open question.

## Then

Print the finished description in full. Offer to open the PR:

```bash
gh pr create --title "<TICKET-ID>: <what it does>" --body-file <file>
```

**Ask before running it.** Opening a pull request is the engineer's call, not the
agent's.

## Rules

- **No invented verification.** If a command was not run, it does not appear.
  Not "should pass", not "presumably clean". This is the fastest way to lose a
  reviewer's trust, and it is the thing Marcus actually checks. If a verification
  step is missing, either run it now or write "not run" beside it.
- **Plain language over ceremony.** "Ops can pick the columns" beats "implemented
  configurable column selection".
- **Never soften an unmet criterion** into something it did meet.
- **No file lists in prose.** The diff is the file list.
- **Scannable.** Short paragraphs, real bullets. A reviewer skims first.
- **No emoji, no filler, no summary of the summary.**
- Leave a template section empty with a one-line reason rather than filling it
  with something unverified. "None — nothing outside the ticket was touched" is a
  complete answer.
