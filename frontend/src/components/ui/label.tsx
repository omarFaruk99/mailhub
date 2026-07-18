"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// `required` renders a small danger-colored * marker (theme-aware) after the label.
function Label({ className, required, children, ...props }: React.ComponentProps<"label"> & { required?: boolean }) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-1 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required && <span className="text-destructive" aria-hidden="true">*</span>}
    </label>
  )
}

export { Label }
