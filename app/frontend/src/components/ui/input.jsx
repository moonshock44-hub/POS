import * as React from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-xl brutal-border bg-white px-3 py-2 text-sm font-medium text-ink placeholder:text-ink/40 outline-none focus-visible:ring-2 focus-visible:ring-lavender focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
        className
      )}
      {...props}
    />
  )
}
