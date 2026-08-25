import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  if (type === "date") {
    return <DateInput className={className} {...props} />
  }
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

/**
 * A native date input's own internal text/placeholder isn't reliably
 * visible everywhere: some mobile browsers/WebViews render no "dd/mm/yyyy"
 * hint at all for an empty field, and the internal text otherwise renders
 * in whatever color the browser picks for its own widget, which can go
 * invisible against a dark, semi-transparent field. This forces the field
 * itself to a light surface (so the browser's own rendering is always
 * legible, in any app theme) and draws an explicit "dd/mm/yyyy" hint on top
 * while empty, since we can't rely on the browser to show one itself.
 */
function DateInput({ className, onChange, value, defaultValue, ...props }: React.ComponentProps<"input">) {
  const [empty, setEmpty] = React.useState(() => !(value ?? defaultValue))

  return (
    <div className="relative">
      <InputPrimitive
        type="date"
        data-slot="input"
        value={value}
        defaultValue={defaultValue}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setEmpty(!e.target.value)
          onChange?.(e)
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-white px-2.5 py-1 text-base text-slate-900 [color-scheme:light] transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
          empty && "text-transparent",
          className
        )}
        {...props}
      />
      {empty && (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-base text-slate-400 md:text-sm">
          dd/mm/yyyy
        </span>
      )}
    </div>
  )
}

export { Input }
