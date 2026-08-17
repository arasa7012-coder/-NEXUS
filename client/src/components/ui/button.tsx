import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-[0.01em] transition-transform duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(59,130,246,0.2)] hover:bg-primary/90 hover:shadow-[0_12px_24px_rgba(59,130,246,0.28)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_8px_20px_rgba(239,68,68,0.16)] hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-border bg-card/50 text-foreground shadow-xs hover:border-border-light hover:bg-background-tertiary",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_8px_20px_rgba(139,92,246,0.16)] hover:bg-secondary/80",
        ghost:
          "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        sm: "h-9 min-h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 min-h-11 rounded-xl px-6 has-[>svg]:px-4",
        icon: "size-10 min-h-10",
        "icon-sm": "size-9 min-h-9",
        "icon-lg": "size-11 min-h-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
