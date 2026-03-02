import type { HTMLAttributes } from 'react'
import { cn } from '#lib/utils/cn'

const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('animate-pulse rounded-md bg-gray-200/80 dark:bg-gray-700/60', className)}
    {...props}
  />
)

export { Skeleton }
