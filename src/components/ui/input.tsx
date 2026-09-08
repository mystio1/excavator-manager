import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  if (type === "date") {
    return <DateInput className={className} {...props} />
  }
  if (type === "password") {
    return <PasswordInput className={className} {...props} />
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
 * while empty and unfocused, since we can't rely on the browser to show one
 * itself.
 *
 * The "unfocused" half matters: `empty` only turns false once the WHOLE
 * date is validly complete, so a naive `empty`-only check keeps the real
 * text hidden for the entire time a segment (day/month/year) is being
 * typed or selected — fighting the browser's own segment-highlight
 * rendering the whole time and making the very thing you're editing hard to
 * read. Hiding it only while unfocused avoids that: once you click in, the
 * browser's already-legible native rendering just shows through untouched.
 */
function DateInput({ className, onChange, value, defaultValue, ...props }: React.ComponentProps<"input">) {
  const [empty, setEmpty] = React.useState(() => !(value ?? defaultValue))
  const [focused, setFocused] = React.useState(false)
  const showFakePlaceholder = empty && !focused

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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-white px-2.5 py-1 text-base text-slate-900 [color-scheme:light] transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
          showFakePlaceholder && "text-transparent",
          className
        )}
        {...props}
      />
      {showFakePlaceholder && (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-base text-slate-400 md:text-sm">
          dd/mm/yyyy
        </span>
      )}
    </div>
  )
}

/** Every password/PIN field in the app gets a right-aligned show/hide
 * toggle for free through this — same "special-case by type, no caller
 * changes needed" approach as DateInput above. tabIndex={-1} keeps it out
 * of the tab order so it doesn't interrupt moving from this field to the
 * next one. */
function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <InputPrimitive
        type={visible ? "text" : "password"}
        data-slot="input"
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 pr-8 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-2.5 flex items-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export { Input }
