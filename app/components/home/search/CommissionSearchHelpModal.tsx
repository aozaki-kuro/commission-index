'use client'

import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment } from 'react'

type CommissionSearchHelpModalProps = {
  isOpen: boolean
  onClose: (open: boolean) => void
}

const searchSyntaxRows = [
  {
    syntax: 'space',
    description: 'All terms must match',
    example: 'blue hair',
  },
  {
    syntax: '|',
    description: 'Either side can match',
    example: 'blue | silver',
  },
  {
    syntax: '!',
    description: 'Exclude a term',
    example: '!sketch',
  },
]

export default function CommissionSearchHelpModal({
  isOpen,
  onClose,
}: CommissionSearchHelpModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-[2px] dark:bg-black/55" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="w-full max-w-md rounded-2xl border border-gray-300/80 bg-white/95 p-5 text-sm text-gray-700 shadow-[0_16px_50px_rgba(0,0,0,0.16)] backdrop-blur-sm md:text-base dark:border-gray-700 dark:bg-black/90 dark:text-gray-300">
              <DialogTitle className="text-base font-bold text-gray-900 md:text-lg dark:text-gray-100">
                Search Help
              </DialogTitle>

              <div className="mt-3 space-y-3 text-gray-700 dark:text-gray-300">
                <p className="text-xs md:text-sm">
                  Type one or more keywords to filter commissions.
                </p>

                <div className="overflow-hidden rounded-lg border border-gray-200/90 dark:border-gray-700/90">
                  <div className="max-w-full overflow-x-auto">
                    <table className="w-full min-w-[18rem] border-separate border-spacing-0 text-left text-xs leading-relaxed md:text-sm">
                      <thead className="bg-gray-100/80 text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Syntax</th>
                          <th className="px-3 py-2 font-semibold">Meaning</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700/80">
                        {searchSyntaxRows.map(row => (
                          <tr key={row.syntax} className="align-top">
                            <td className="w-20 px-3 py-2.5">
                              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 md:text-xs dark:bg-gray-800 dark:text-gray-200">
                                {row.syntax}
                              </code>
                            </td>
                            <td className="px-3 py-2.5 text-[11px] sm:text-xs md:text-sm">
                              <p>{row.description}.</p>
                              <p className="mt-0.5 wrap-break-word text-gray-500 dark:text-gray-400">
                                Example:{' '}
                                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 md:text-xs dark:bg-gray-800 dark:text-gray-300">
                                  {row.example}
                                </code>
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-[11px] wrap-break-word text-gray-500 sm:text-xs md:text-sm dark:text-gray-400">
                  Combined example:{' '}
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 md:text-xs dark:bg-gray-800 dark:text-gray-300">
                    blue hair | silver !sketch
                  </code>
                </p>
                <p className="text-[11px] wrap-break-word text-gray-500 sm:text-xs md:text-sm dark:text-gray-400">
                  Creator search also matches registered aliases (for example, romanized names).
                </p>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => onClose(false)}
                  className="rounded-md border border-gray-300/80 bg-gray-100/85 px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus-visible:outline-gray-300"
                >
                  Close
                </button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
