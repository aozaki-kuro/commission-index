'use client'

import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import Image from 'next/image'
import { Fragment, type RefObject } from 'react'

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
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-10"
        onClose={() => null}
        initialFocus={confirmButtonRef}
        static
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 backdrop-blur-xl dark:bg-white/5" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-950">
                <Image
                  src={HeadImage}
                  alt="Commission Index"
                  quality={80}
                  placeholder="blur"
                  className="mb-4 select-none"
                  priority
                />
                <DialogTitle
                  as="h3"
                  className="text-center text-lg leading-6 font-bold text-gray-900 select-none dark:text-gray-300"
                >
                  [ Warning ]
                </DialogTitle>
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
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
