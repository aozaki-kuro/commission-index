// @vitest-environment jsdom
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../hooks/useToast'
import { AdminBootstrapStatus } from './AdminBootstrapStatus'
import { DialogNoticeSlot, FloatingNotice, FloatingNoticeProvider } from './FloatingNotice'
import { FormStatusIndicator } from './FormStatusIndicator'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

function DialogToastHarness() {
  const [open, setOpen] = useState(true)
  const toast = useToast()
  return (
    <>
      <FloatingNotice tone="error">Background refresh failed</FloatingNotice>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Edit</DialogTitle>
          <form>
            <FloatingNotice tone="error">Save failed</FloatingNotice>
            <button
              type="button"
              onClick={() => {
                toast.push({ id: 'entry-deleted', tone: 'success', message: 'Entry deleted.' })
                setOpen(false)
              }}
            >
              Confirm delete
            </button>
          </form>
          <DialogNoticeSlot />
          <footer><button type="button">Save changes</button></footer>
        </DialogContent>
      </Dialog>
    </>
  )
}

describe('浮动通知的布局与生命周期', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('后台刷新和空闲保存均不渲染占位节点', async () => {
    await act(async () => root.render(createElement(FloatingNoticeProvider, null, createElement('main', null, createElement(AdminBootstrapStatus, {
      errorMessage: null,
      isLoading: true,
      hasPayload: true,
      onRetry: vi.fn(),
    }), createElement(FormStatusIndicator, { status: 'idle' })))))
    expect(container.querySelector('main')!.childElementCount).toBe(0)
    expect(container.querySelector('[data-notice-viewport]')!.childElementCount).toBe(0)
    expect(container.textContent).toBe('')
  })

  it('成功通知超时消失，错误保留并可关闭，新错误重新显示', async () => {
    vi.useFakeTimers()
    const render = async (status: 'success' | 'error', message: string) => {
      await act(async () => root.render(createElement(FloatingNoticeProvider, null, createElement('main', null, createElement(FormStatusIndicator, { status, message })))))
    }
    await render('success', 'Saved')
    expect(container.querySelector('main')!.childElementCount).toBe(0)
    expect(container.querySelector('[role="status"]')!.textContent).toContain('Saved')
    await act(async () => vi.advanceTimersByTime(2600))
    expect(container.querySelector('[role="status"]')).toBeNull()
    await render('error', 'Connection lost')
    await act(async () => vi.advanceTimersByTime(10000))
    expect(container.querySelector('details')!.textContent).toContain('Connection lost')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss notification"]')!.click())
    expect(container.querySelector('[role="status"]')).toBeNull()
    await render('error', 'Server unavailable')
    expect(container.querySelector('details')!.textContent).toContain('Server unavailable')
  })

  it('刷新失败提供可展开详情和重试，恢复后无残留', async () => {
    const onRetry = vi.fn()
    const render = async (errorMessage: string | null) => {
      await act(async () => root.render(createElement(FloatingNoticeProvider, null, createElement(AdminBootstrapStatus, {
        errorMessage,
        isLoading: false,
        hasPayload: true,
        onRetry,
      }))))
    }
    await render('Detailed API failure')
    expect(container.querySelector('details')!.textContent).toContain('Detailed API failure')
    const retry = [
      ...container.querySelectorAll('button'),
    ].find(button => button.textContent === 'Try again')!
    await act(async () => retry.click())
    expect(onRetry).toHaveBeenCalledOnce()
    await render(null)
    expect(container.querySelector('[data-notice-viewport="page"]')!.childElementCount).toBe(0)
  })

  it('模态框错误留在对话框内联托盘，成功 Toast 悬浮在页面右上角且关窗后不丢失', async () => {
    vi.useFakeTimers()
    await act(async () => root.render(
      <FloatingNoticeProvider>
        <DialogToastHarness />
      </FloatingNoticeProvider>,
    ))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.querySelector('form')!.querySelector('[role="status"]')).toBeNull()
    expect(dialog.querySelector('[data-notice-viewport="dialog"] [role="status"]')!.textContent).toBe('Save failed')
    const pageViewport = container.querySelector('[data-notice-viewport="page"]')!
    const toastViewport = container.querySelector('[data-notice-viewport="toast"]')!
    const dialogViewport = dialog.querySelector('[data-notice-viewport="dialog"]')!
    expect(pageViewport.className).toContain('fixed')
    expect(pageViewport.className).toContain('z-40')
    expect(pageViewport.className).toContain('env(safe-area-inset-bottom)')
    expect(toastViewport.className).toContain('fixed')
    expect(toastViewport.className).toContain('z-90')
    expect(toastViewport.className).toContain('env(safe-area-inset-top)')
    // The dialog notice slot sits right above the footer, never overlaid on it.
    expect(dialogViewport.nextElementSibling?.tagName).toBe('FOOTER')
    expect(pageViewport.textContent).toBe('Background refresh failed')
    expect(dialog.querySelector('[role="status"]')!.closest('[aria-hidden="true"]')).toBeNull()

    await act(async () => dialog.querySelector<HTMLButtonElement>('button')!.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(toastViewport.textContent).toContain('Entry deleted.')
    await act(async () => vi.advanceTimersByTime(2600))
    expect(toastViewport.childElementCount).toBe(0)
  })
})
