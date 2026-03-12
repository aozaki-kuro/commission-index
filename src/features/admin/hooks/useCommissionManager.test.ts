import { describe, expect, it, vi } from 'vitest'

import type { FormState } from '../types'
import { createLatestCharacterOrderSaveQueue } from './useCommissionManager'

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('createLatestCharacterOrderSaveQueue', () => {
  it('serializes saves and only notifies for the latest successful order', async () => {
    const resolvers: Array<(value: FormState) => void> = []
    const saveOrder = vi.fn(
      () =>
        new Promise<FormState>(resolve => {
          resolvers.push(resolve)
        }),
    )
    const onSaved = vi.fn()
    const queue = createLatestCharacterOrderSaveQueue({
      saveOrder,
      onSaved,
    })

    queue.enqueue({
      active: [1],
      stale: [2],
    })
    queue.enqueue({
      active: [2],
      stale: [1],
    })

    expect(saveOrder).toHaveBeenCalledTimes(1)
    expect(saveOrder).toHaveBeenNthCalledWith(1, {
      active: [1],
      stale: [2],
    })

    resolvers[0]({
      status: 'success',
      message: 'saved first',
    })
    await flushPromises()

    expect(saveOrder).toHaveBeenCalledTimes(2)
    expect(saveOrder).toHaveBeenNthCalledWith(2, {
      active: [2],
      stale: [1],
    })
    expect(onSaved).not.toHaveBeenCalled()

    resolvers[1]({
      status: 'success',
      message: 'saved second',
    })
    await flushPromises()

    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
