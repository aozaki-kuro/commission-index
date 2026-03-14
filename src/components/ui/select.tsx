import { cn } from '#lib/utils/cn'
import * as SelectPrimitive from '@radix-ui/react-select'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import * as React from 'react'

function ChevronDown() {
  return <IconChevronDown className="size-4 text-gray-400" stroke={1.7} aria-hidden="true" />
}

const Check = () => <IconCheck className="size-4" stroke={1.8} aria-hidden="true" />

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

function SelectTrigger({ ref, className, children, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { ref?: React.RefObject<React.ComponentRef<typeof SelectPrimitive.Trigger> | null> }) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        `
          flex h-10 w-full items-center justify-between rounded-md border
          border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-sm
          placeholder:text-gray-400
          focus:outline-none
          focus-visible:ring-2 focus-visible:ring-gray-500
          focus-visible:ring-offset-2 focus-visible:ring-offset-white
          disabled:cursor-not-allowed disabled:opacity-70
          dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100
          dark:focus-visible:ring-offset-gray-900
        `,
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

function SelectContent({ ref, className, children, position = 'popper', ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { ref?: React.RefObject<React.ComponentRef<typeof SelectPrimitive.Content> | null> }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          `
            relative z-50 max-h-64 min-w-32 overflow-hidden rounded-lg border
            border-gray-200 bg-white/95 p-1 text-gray-900 shadow-lg ring-1
            ring-black/5
            dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-100
            dark:ring-white/10
          `,
          className,
        )}
        position={position}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn(
            'p-0',
            position === 'popper'
            && `
              h-(--radix-select-trigger-height) w-full
              min-w-(--radix-select-trigger-width)
            `,
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}
SelectContent.displayName = SelectPrimitive.Content.displayName

function SelectLabel({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label> & { ref?: React.RefObject<React.ComponentRef<typeof SelectPrimitive.Label> | null> }) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-xs font-semibold text-gray-500', className)}
      {...props}
    />
  )
}
SelectLabel.displayName = SelectPrimitive.Label.displayName

function SelectItem({ ref, className, children, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { ref?: React.RefObject<React.ComponentRef<typeof SelectPrimitive.Item> | null> }) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        `
          relative flex w-full cursor-pointer items-center justify-between gap-3
          rounded-md px-3 py-2 text-sm text-gray-700 transition outline-none
          select-none
          focus:bg-gray-900/5 focus:text-gray-900
          data-disabled:pointer-events-none data-disabled:opacity-50
          dark:text-gray-100
          dark:focus:bg-white/10 dark:focus:text-gray-100
        `,
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}
SelectItem.displayName = SelectPrimitive.Item.displayName

function SelectSeparator({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator> & { ref?: React.RefObject<React.ComponentRef<typeof SelectPrimitive.Separator> | null> }) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn(`
        -mx-1 my-1 h-px bg-gray-200
        dark:bg-gray-700
      `, className)}
      {...props}
    />
  )
}
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
