'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '#lib/utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
  {
    variants: {
      variant: {
        default:
          'bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200',
        destructive: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400',
        outline:
          'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800',
        ghost: 'text-gray-700 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'

  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
})

Button.displayName = 'Button'

export { Button, buttonVariants }
