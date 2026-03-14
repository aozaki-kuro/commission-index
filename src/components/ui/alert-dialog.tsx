import { cn } from '#lib/utils/cn'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import * as React from 'react'

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal
function AlertDialogOverlay({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay> & {
  ref?: React.RefObject<React.ComponentRef<typeof AlertDialogPrimitive.Overlay> | null>
}) {
  return (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      className={cn(
        `
          fixed inset-0 z-70 bg-black/25 backdrop-blur-sm
          data-[state=closed]:animate-[dialog-overlay-out_150ms_ease-in]
          data-[state=open]:animate-[dialog-overlay-in_200ms_ease-out]
          dark:bg-white/5
        `,
        className,
      )}
      {...props}
    />
  )
}
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

function AlertDialogContent({
  ref,
  className,
  children,
  overlayClassName,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & {
  overlayClassName?: string
} & { ref?: React.RefObject<React.ComponentRef<typeof AlertDialogPrimitive.Content> | null> }) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay className={overlayClassName} />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          `
            fixed top-1/2 left-1/2 z-80 grid max-h-[calc(100dvh-2rem)]
            w-[calc(100%-2rem)] max-w-lg origin-center -translate-1/2 gap-4
            overflow-y-auto rounded-2xl border border-transparent bg-white p-6
            shadow-xl
            data-[state=closed]:animate-[dialog-content-out_150ms_ease-in]
            data-[state=open]:animate-[dialog-content-in_200ms_ease-out]
            dark:bg-gray-950
          `,
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(`
        flex flex-col space-y-2 text-center
        sm:text-left
      `, className)}
      {...props}
    />
  )
}
AlertDialogHeader.displayName = 'AlertDialogHeader'

function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(`
        flex flex-col-reverse
        sm:flex-row sm:justify-end sm:space-x-2
      `, className)}
      {...props}
    />
  )
}
AlertDialogFooter.displayName = 'AlertDialogFooter'

function AlertDialogTitle({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title> & {
  ref?: React.RefObject<React.ComponentRef<typeof AlertDialogPrimitive.Title> | null>
}) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold', className)}
      {...props}
    />
  )
}
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

function AlertDialogDescription({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description> & {
  ref?: React.RefObject<React.ComponentRef<typeof AlertDialogPrimitive.Description> | null>
}) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn(`
        text-sm text-gray-600
        dark:text-gray-300
      `, className)}
      {...props}
    />
  )
}
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName

function AlertDialogAction({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & {
  ref?: React.RefObject<React.ComponentRef<typeof AlertDialogPrimitive.Action> | null>
}) {
  return <AlertDialogPrimitive.Action ref={ref} className={className} {...props} />
}
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

function AlertDialogCancel({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel> & {
  ref?: React.RefObject<React.ComponentRef<typeof AlertDialogPrimitive.Cancel> | null>
}) {
  return <AlertDialogPrimitive.Cancel ref={ref} className={className} {...props} />
}
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
