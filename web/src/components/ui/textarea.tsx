import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-2.5 py-2 text-base text-[#e6edf3] transition-colors outline-none placeholder:text-[#7d8590] focus-visible:border-[#3b82f6] focus-visible:ring-3 focus-visible:ring-[#3b82f6]/25 disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:opacity-50 aria-invalid:border-[#f85149] aria-invalid:ring-3 aria-invalid:ring-[#f85149]/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
