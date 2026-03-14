import { cn } from '#lib/utils/cn'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as React from 'react'

const Tabs = TabsPrimitive.Root

function TabsList({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { ref?: React.RefObject<React.ComponentRef<typeof TabsPrimitive.List> | null> }) {
  return <TabsPrimitive.List ref={ref} className={cn('inline-flex items-center', className)} {...props} />
}
TabsList.displayName = TabsPrimitive.List.displayName

function TabsTrigger({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { ref?: React.RefObject<React.ComponentRef<typeof TabsPrimitive.Trigger> | null> }) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        `
          inline-flex items-center justify-center rounded-md text-sm font-medium
          whitespace-nowrap transition-all
          focus-visible:outline-none
          disabled:pointer-events-none disabled:opacity-50
        `,
        className,
      )}
      {...props}
    />
  )
}
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

function TabsContent({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & { ref?: React.RefObject<React.ComponentRef<typeof TabsPrimitive.Content> | null> }) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn('focus-visible:outline-none', className)}
      {...props}
    />
  )
}
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsContent, TabsList, TabsTrigger }
