'use client'

import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment, type RefObject } from 'react'

interface CharacterDeleteDialogProps {
  isOpen: boolean
  characterName: string
  commissionCount: number
  isDeletePending: boolean
  confirmButtonRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onConfirm: () => void
}

const CharacterDeleteDialog = ({
  isOpen,
  characterName,
  commissionCount,
  isDeletePending,
  confirmButtonRef,
  onClose,
  onConfirm,
}: CharacterDeleteDialogProps) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={onClose} initialFocus={confirmButtonRef}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 backdrop-blur-sm dark:bg-white/5" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-950">
                <DialogTitle as="h3" className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Delete character?
                </DialogTitle>
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    This will remove the character and all associated commissions. This action
                    cannot be undone.
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    <span className="font-semibold">{characterName}</span> has{' '}
                    <span className="font-mono">{commissionCount}</span> entr
                    {commissionCount === 1 ? 'y' : 'ies'}.
                  </p>
                </div>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus-visible:ring-offset-gray-900"
                    onClick={onClose}
                    disabled={isDeletePending}
                  >
                    Cancel
                  </button>
                  <button
                    ref={confirmButtonRef}
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-70 dark:bg-red-500 dark:hover:bg-red-400 dark:focus-visible:ring-offset-gray-900"
                    onClick={onConfirm}
                    disabled={isDeletePending}
                  >
                    Delete
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

export default CharacterDeleteDialog
