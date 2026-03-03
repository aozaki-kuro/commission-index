import { Button } from '#components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '#components/ui/dialog'
import { type RefObject } from 'react'

const HeadImage = '/nsfw-cover-s.webp'

type WarningModalProps = {
  isOpen: boolean
  confirmButtonRef: RefObject<HTMLButtonElement | null>
  onConfirm: () => void
  onLeave: () => void
}

export default function WarningModal({
  isOpen,
  confirmButtonRef,
  onConfirm,
  onLeave,
}: WarningModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        overlayClassName="bg-black/25 backdrop-blur-xl dark:bg-white/5 data-[state=open]:animate-[dialog-overlay-in_300ms_ease-out] data-[state=closed]:animate-[dialog-overlay-out_200ms_ease-in]"
        className="w-full max-w-md overflow-hidden rounded-2xl border-none bg-white p-6 text-left shadow-xl data-[state=closed]:animate-[dialog-content-out_200ms_ease-in] data-[state=open]:animate-[dialog-content-in_300ms_ease-out] dark:bg-gray-950"
        onEscapeKeyDown={event => event.preventDefault()}
        onPointerDownOutside={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
        onOpenAutoFocus={event => {
          event.preventDefault()
          confirmButtonRef.current?.focus()
        }}
      >
        <img src={HeadImage} alt="Commission Index" className="mb-4 select-none" />
        <DialogTitle className="text-center text-lg leading-6 font-bold text-gray-900 select-none dark:text-gray-300">
          [ Warning ]
        </DialogTitle>
        <DialogDescription className="sr-only">
          Age confirmation required before viewing the full content.
        </DialogDescription>
        <div className="mt-2">
          <p className="text-center text-sm text-gray-500 select-none dark:text-gray-400">
            You have to be over 18 to view the contents.
            <br />
            Please <b>leave now</b> if you are under 18.
          </p>
        </div>
        <div className="mt-4 flex items-center justify-center">
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="outline"
            size="sm"
            className="border-transparent bg-blue-100 px-4 font-mono text-xs font-medium text-blue-900 select-none hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-100 dark:hover:bg-blue-900/55"
            onClick={onConfirm}
          >
            I am over 18
          </Button>
          <div className="mx-3" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-transparent bg-red-100 px-4 font-mono text-xs font-medium text-red-900 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/55"
            onClick={onLeave}
          >
            Leave Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
