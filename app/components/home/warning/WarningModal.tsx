'use client'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '#components/ui/dialog'
import Image from 'next/image'
import { type RefObject } from 'react'

import HeadImage from 'public/nsfw-cover-s.webp'

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
        <Image
          src={HeadImage}
          alt="Commission Index"
          quality={80}
          placeholder="blur"
          className="mb-4 select-none"
          priority
        />
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
          <button
            ref={confirmButtonRef}
            type="button"
            className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 font-mono text-xs font-medium text-blue-900 select-none hover:bg-blue-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            onClick={onConfirm}
          >
            I am over 18
          </button>
          <div className="mx-3" />
          <button
            type="button"
            className="inline-flex justify-center rounded-md border border-transparent bg-red-100 px-4 py-2 font-mono text-xs font-medium text-red-900 hover:bg-red-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            onClick={onLeave}
          >
            Leave Now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
