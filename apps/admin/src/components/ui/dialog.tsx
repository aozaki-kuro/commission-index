import * as DialogPrimitive from '@radix-ui/react-dialog'
import { IconX } from '@tabler/icons-react'
import * as React from 'react'
import { buttonStyles } from '../../app/ui'
import { cn } from '../../lib/cn'
import { FloatingNoticeProvider } from '../FloatingNotice'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close
const DialogPortal = DialogPrimitive.Portal

function DialogOverlay({
  ref,
  className,
  variant = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
  ref?: React.RefObject<React.ComponentRef<typeof DialogPrimitive.Overlay> | null>
  variant?: DialogContentVariant
}) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-dialog-overlay={variant}
      className={cn(
        'fixed inset-0',
        variant === 'alert'
          ? 'z-80 data-[state=closed]:animate-none motion-safe:animate-[dialog-overlay-in_200ms_ease-out]'
          : variant === 'crop'
            ? 'z-60 motion-safe:data-[state=open]:animate-[dialog-overlay-in_150ms_ease-out] motion-safe:data-[state=closed]:animate-[dialog-crop-content-out_150ms_ease-in]'
            : 'z-60 data-[state=open]:animate-[dialog-overlay-in_150ms_ease-out] data-[state=closed]:animate-[dialog-overlay-in_150ms_ease-in_reverse] motion-reduce:animate-none',
        variant === 'crop'
          ? 'bg-gray-200/[0.18] backdrop-blur-[20px] backdrop-saturate-150 dark:bg-gray-900/[0.18]'
          : variant === 'alert'
            ? 'bg-black/40 backdrop-blur-[2px]'
            : 'bg-black/45 backdrop-blur-md',
        className,
      )}
      {...props}
    />
  )
}
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

type DialogContentVariant = 'alert' | 'crop' | 'default' | 'sheet'

const dialogContentBase = {
  // alert：沿用旧删除确认框的尺寸与入场动画；Radix 负责焦点与键盘行为。
  // 层级高于 sheet / default（z-70）：确认框可能从打开的编辑抽屉里弹出。
  alert: `
    fixed top-1/2 left-1/2 z-80 w-[calc(100%-2rem)] max-w-md
    -translate-x-1/2 -translate-y-1/2 rounded-2xl admin-surface shadow-xl
    p-6
    ring-1 ring-gray-900/10 dark:ring-white/10
    motion-safe:animate-[dialogEnter_240ms_cubic-bezier(0.25,1,0.5,1)]
  `,
  // crop：移动端全屏、桌面端大尺寸工作区；不做 scale 动画，避免破坏裁剪器测量。
  crop: `
    fixed inset-0 z-70 flex flex-col overflow-hidden border-white/45
    bg-white dark:border-white/12 dark:bg-[#1c1c1e]
    motion-safe:data-[state=open]:animate-[dialog-crop-content-in_200ms_ease-out]
    motion-safe:data-[state=closed]:animate-[dialog-crop-content-out_150ms_ease-in]
    sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(90dvh,52rem)]
    sm:w-[min(92vw,64rem)] sm:-translate-x-1/2 sm:-translate-y-1/2
    sm:rounded-2xl sm:border sm:shadow-[0_24px_80px_rgb(0_0_0_/_0.22)]
    sm:ring-1 sm:ring-black/8 dark:sm:shadow-[0_28px_90px_rgb(0_0_0_/_0.52)]
    dark:sm:ring-white/10
  `,
  // 默认：始终居中浮层
  default: `
    fixed top-1/2 left-1/2 z-70 flex max-h-[85dvh] w-full max-w-2xl
    -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden
    rounded-2xl admin-surface shadow-xl ring-1 ring-black/10
    dark:ring-white/10
    motion-safe:data-[state=open]:animate-[dialog-content-in_200ms_ease-out]
    motion-safe:data-[state=closed]:animate-[dialog-content-out_150ms_ease-in]
  `,
  // sheet：移动端全屏，>=sm 退化为居中浮层；避免 vaul 那种 fixed+transform 触发的键盘异常。
  // 详情保持聚焦工作区，宽度独立于页面的侧栏与内容网格。
  sheet: `
    fixed inset-0 z-70 flex flex-col overflow-hidden admin-surface
    motion-safe:data-[state=open]:animate-[dialog-content-in_200ms_ease-out]
    motion-safe:data-[state=closed]:animate-[dialog-content-out_150ms_ease-in]
    sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[85dvh] sm:w-full sm:max-w-3xl
    sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl
    sm:shadow-xl
  `,
} as const satisfies Record<DialogContentVariant, string>

function DialogContent({
  ref,
  className,
  children,
  variant = 'default',
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  ref?: React.RefObject<React.ComponentRef<typeof DialogPrimitive.Content> | null>
  variant?: DialogContentVariant
}) {
  return (
    <DialogPortal>
      <DialogOverlay variant={variant} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(dialogContentBase[variant], className)}
        {...props}
      >
        <FloatingNoticeProvider local>{children}</FloatingNoticeProvider>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}
DialogContent.displayName = DialogPrimitive.Content.displayName

function DialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center border-b border-gray-200 px-5 py-4 dark:border-gray-800',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function DialogTitle({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
  ref?: React.RefObject<React.ComponentRef<typeof DialogPrimitive.Title> | null>
}) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('min-w-0 flex-1', className)}
      {...props}
    />
  )
}
DialogTitle.displayName = DialogPrimitive.Title.displayName

function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-gray-600 dark:text-gray-300', className)}
      {...props}
    />
  )
}
DialogDescription.displayName = DialogPrimitive.Description.displayName

function DialogCloseButton({ className, disabled }: { className?: string, disabled?: boolean }) {
  return (
    <DialogClose asChild>
      <button
        type="button"
        disabled={disabled}
        className={cn(buttonStyles.icon, 'ml-3 size-11', className)}
        aria-label="Close"
      >
        <IconX className="size-4" stroke={1.8} aria-hidden="true" />
      </button>
    </DialogClose>
  )
}

export {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
