import { cn } from '@/lib/utils'

export function Card({ className, ...props }) {
  return (
    <div
      className={cn('rounded-2xl brutal-border brutal-shadow-lg bg-cream/95 backdrop-blur-sm', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1.5 p-6 pb-3', className)} {...props} />
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('font-display text-2xl leading-none', className)} {...props} />
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-ink/70 font-medium', className)} {...props} />
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-6 pt-2', className)} {...props} />
}
