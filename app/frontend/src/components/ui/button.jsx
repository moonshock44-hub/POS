import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold brutal-border brutal-shadow transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
  {
    variants: {
      variant: {
        default: 'bg-lavender text-ink hover:bg-[#b89fff]',
        primary: 'bg-coral text-ink hover:bg-[#ff7a68]',
        mint: 'bg-mint text-ink hover:bg-[#9ee8d8]',
        lemon: 'bg-lemon text-ink hover:bg-[#ffd93d]',
        outline: 'bg-cream text-ink hover:bg-white',
        ghost: 'bg-transparent border-transparent shadow-none hover:bg-white/50',
      },
      size: {
        default: 'h-11 px-5 py-2 text-sm',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-7 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
