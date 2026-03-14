import { cn } from '#lib/utils/cn'
import { Command as CommandPrimitive } from 'cmdk'
import * as React from 'react'

const useSafeLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

function setForwardedRef<T,>(ref: React.ForwardedRef<T> | undefined, value: T) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }

  if (!ref) {
    return
  }

  ;(ref as { current: T }).current = value
}

function Command({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof CommandPrimitive> & { ref?: React.RefObject<React.ComponentRef<typeof CommandPrimitive> | null> }) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-md bg-transparent',
        className,
      )}
      {...props}
    />
  )
}
Command.displayName = CommandPrimitive.displayName

function CommandInput({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & { ref?: React.RefObject<React.ComponentRef<typeof CommandPrimitive.Input> | null> }) {
  const inputRef = React.useRef<React.ComponentRef<typeof CommandPrimitive.Input>>(null)

  useSafeLayoutEffect(() => {
    const inputElement = inputRef.current
    if (!inputElement)
      return

    const currentControlsId = inputElement.getAttribute('aria-controls')
    if (currentControlsId) {
      inputElement.dataset.cmdkControlsId = currentControlsId
    }

    const controlsId = inputElement.dataset.cmdkControlsId
    if (!controlsId)
      return

    const controlsElement = document.getElementById(controlsId)
    if (controlsElement) {
      inputElement.setAttribute('aria-controls', controlsId)
      inputElement.setAttribute('aria-expanded', 'true')
      return
    }

    inputElement.removeAttribute('aria-controls')
    inputElement.removeAttribute('aria-activedescendant')
    inputElement.setAttribute('aria-expanded', 'false')
  })

  return (
    <CommandPrimitive.Input
      ref={(node) => {
        inputRef.current = node
        setForwardedRef(ref, node)
      }}
      className={cn(
        `
          flex h-10 w-full rounded-md bg-transparent text-sm outline-none
          disabled:cursor-not-allowed disabled:opacity-50
        `,
        className,
      )}
      {...props}
    />
  )
}
CommandInput.displayName = CommandPrimitive.Input.displayName

function CommandList({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.List> & { ref?: React.RefObject<React.ComponentRef<typeof CommandPrimitive.List> | null> }) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn('max-h-75 overflow-y-auto', className)}
      {...props}
    />
  )
}
CommandList.displayName = CommandPrimitive.List.displayName

function CommandEmpty({ ref, ...props }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty> & { ref?: React.RefObject<React.ComponentRef<typeof CommandPrimitive.Empty> | null> }) {
  return <CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm" {...props} />
}
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

function CommandGroup({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group> & { ref?: React.RefObject<React.ComponentRef<typeof CommandPrimitive.Group> | null> }) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(`
        overflow-hidden p-1 text-gray-950
        dark:text-gray-50
      `, className)}
      {...props}
    />
  )
}
CommandGroup.displayName = CommandPrimitive.Group.displayName

function CommandSeparator({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator> & { ref?: React.RefObject<React.ComponentRef<typeof CommandPrimitive.Separator> | null> }) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cn(`
        -mx-1 h-px bg-gray-200
        dark:bg-gray-700
      `, className)}
      {...props}
    />
  )
}
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

function CommandItem({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & { ref?: React.RefObject<React.ComponentRef<typeof CommandPrimitive.Item> | null> }) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        `
          relative flex cursor-pointer items-center rounded-sm px-2 py-1.5
          text-sm outline-none select-none
          data-[disabled=true]:pointer-events-none
          data-[disabled=true]:opacity-50
        `,
        className,
      )}
      {...props}
    />
  )
}
CommandItem.displayName = CommandPrimitive.Item.displayName

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
}
