import * as React from "react";
import { cn } from "#/lib/utils";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    ref?: React.Ref<HTMLTextAreaElement>;
  };

export function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-11 w-full resize-none rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm leading-6 text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}
