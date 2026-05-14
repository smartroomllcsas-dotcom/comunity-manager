import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-[#2d333b] bg-[#0d1117] px-2.5 py-1 text-base text-[#e6edf3] transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#e6edf3] placeholder:text-[#7d8590] focus-visible:border-[#3b82f6] focus-visible:ring-3 focus-visible:ring-[#3b82f6]/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:opacity-50 aria-invalid:border-[#f85149] aria-invalid:ring-3 aria-invalid:ring-[#f85149]/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
