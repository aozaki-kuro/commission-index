import type { VariantProps } from 'class-variance-authority'
import { cn } from '#lib/utils/cn'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'

import * as React from 'react'

const buttonVariants = cva(
  `
    inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium
    whitespace-nowrap transition
    focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2
    focus-visible:ring-offset-white focus-visible:outline-none
    disabled:pointer-events-none disabled:opacity-50
    dark:focus-visible:ring-offset-gray-900
  `,
  {
    variants: {
      variant: {
        default:
          `
            bg-gray-900 text-white
            hover:bg-gray-700
            dark:bg-gray-100 dark:text-gray-900
            dark:hover:bg-gray-200
          `,
        destructive: `
          bg-red-600 text-white
          hover:bg-red-700
          dark:bg-red-500
          dark:hover:bg-red-400
        `,
        outline:
          `
            border border-gray-300 bg-white text-gray-700
            hover:bg-gray-100
            dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100
            dark:hover:bg-gray-800
          `,
        ghost: `
          text-gray-700
          hover:bg-gray-100
          dark:text-gray-100
          dark:hover:bg-gray-800
        `,
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({ ref, className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'>
  & VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  } & { ref?: React.RefObject<HTMLButtonElement | null> }) {
  const Comp = asChild ? Slot : 'button'

  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
}

Button.displayName = 'Button'

export { Button }
