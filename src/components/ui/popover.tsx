import { cn } from '#lib/utils/cn'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as React from 'react'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

function PopoverContent({ ref, className, align = 'center', sideOffset = 8, ...props }: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { ref?: React.RefObject<React.ComponentRef<typeof PopoverPrimitive.Content> | null> }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          `
            z-80 w-72 rounded-lg border border-gray-300/80 bg-white/95 p-4
            text-sm text-gray-700 shadow-[0_10px_30px_rgba(0,0,0,0.12)]
            backdrop-blur-sm outline-none
            data-[state=closed]:animate-[popover-content-out_120ms_ease-in]
            data-[state=open]:animate-[popover-content-in_180ms_cubic-bezier(0.16,1,0.3,1)]
            dark:border-gray-700 dark:bg-black/90 dark:text-gray-300
          `,
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
