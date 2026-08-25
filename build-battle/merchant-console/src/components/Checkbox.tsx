// Tremor Checkbox [v0.0.1]

"use client"

import * as React from "react"

import { cx, focusRing } from "@/lib/utils"

/**
 * A labelled checkbox. Native input rather than a Radix primitive, because
 * @radix-ui/react-checkbox is not a dependency here and a checkbox is one of
 * the few controls the platform already gets right — including for a keyboard
 * and a screen reader, which is how ops works this dialog.
 */
const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<"input">, "type">
>(({ className, ...props }, forwardedRef) => {
  return (
    <input
      ref={forwardedRef}
      type="checkbox"
      className={cx(
        "size-4 shrink-0 cursor-pointer rounded border accent-blue-500",
        "border-gray-300 dark:border-gray-800",
        "disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
        className,
      )}
      {...props}
    />
  )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
