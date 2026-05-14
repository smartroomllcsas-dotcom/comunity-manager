import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-[#3b82f6]/15 text-[#58a6ff] [a]:hover:bg-[#3b82f6]/25",
        secondary:
          "bg-[#1e2433] text-[#e6edf3] [a]:hover:bg-[#2d333b]",
        destructive:
          "bg-[#f85149]/15 text-[#f85149] focus-visible:ring-[#f85149]/20 [a]:hover:bg-[#f85149]/25",
        outline:
          "border-[#2d333b] text-[#e6edf3] [a]:hover:bg-[#1a1f2e] [a]:hover:text-[#e6edf3]",
        ghost:
          "hover:bg-[#1a1f2e] hover:text-[#e6edf3]",
        link: "text-[#3b82f6] underline-offset-4 hover:underline",
        success: "bg-[#3fb950]/15 text-[#3fb950]",
        warning: "bg-[#d29922]/15 text-[#d29922]",
        purple: "bg-[#a371f7]/15 text-[#a371f7]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
