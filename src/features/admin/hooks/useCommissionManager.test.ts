import type { FormState } from '../types'

import { describe, expect, it, vi } from 'vitest'
import { createLatestCharacterOrderSaveQueue } from './useCommissionManager'

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('createLatestCharacterOrderSaveQueue', () => {
  it('serializes saves and only notifies for the latest successful order', async () => {
    const resolvers: Array<(value: FormState) => void> = []
    const saveOrder = vi.fn(
      () =>
        new Promise<FormState>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const onSaved = vi.fn()
    const onError = vi.fn()
    const queue = createLatestCharacterOrderSaveQueue({
      saveOrder,
      onSaved,
      onError,
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
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports the latest failed order save', async () => {
    const resolvers: Array<(value: FormState) => void> = []
    const saveOrder = vi.fn(
      () =>
        new Promise<FormState>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const onSaved = vi.fn()
    const onError = vi.fn()
    const queue = createLatestCharacterOrderSaveQueue({
      saveOrder,
      onSaved,
      onError,
    })

    queue.enqueue({
      active: [1],
      stale: [2],
    })

    resolvers[0]({
      status: 'error',
      message: 'save failed',
    })
    await flushPromises()

    expect(onSaved).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('save failed')
  })

  it('ignores stale save failures once a newer order is queued', async () => {
    const resolvers: Array<(value: FormState) => void> = []
    const saveOrder = vi.fn(
      () =>
        new Promise<FormState>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const onSaved = vi.fn()
    const onError = vi.fn()
    const queue = createLatestCharacterOrderSaveQueue({
      saveOrder,
      onSaved,
      onError,
    })

    queue.enqueue({
      active: [1],
      stale: [2],
    })
    queue.enqueue({
      active: [2],
      stale: [1],
    })

    resolvers[0]({
      status: 'error',
      message: 'stale failure',
    })
    await flushPromises()

    expect(onError).not.toHaveBeenCalled()
    expect(saveOrder).toHaveBeenCalledTimes(2)

    resolvers[1]({
      status: 'success',
      message: 'saved second',
    })
    await flushPromises()

    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})
