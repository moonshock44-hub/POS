import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Product thumbnail with broken-URL fallback (Inventory / ProductDialog).
 */
export default function ProductImage({
  src,
  alt = '',
  className,
  iconClassName,
  wrapperClassName,
}) {
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
  }, [src])

  const showImg = Boolean(src) && !broken

  if (!showImg) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center bg-sky/20 text-ink/25',
          wrapperClassName
        )}
        role="img"
        aria-label={alt || 'Sin imagen'}
      >
        <ImageIcon className={cn('h-12 w-12', iconClassName)} aria-hidden />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn('h-full w-full object-cover', className)}
      onError={() => setBroken(true)}
    />
  )
}
