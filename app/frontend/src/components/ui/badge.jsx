import { cn } from '@/lib/utils'

export function Badge({ className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg brutal-border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider',
        className
      )}
      {...props}
    />
  )
}
