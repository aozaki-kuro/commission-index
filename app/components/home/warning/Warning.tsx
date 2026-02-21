'use client'

import dynamic from 'next/dynamic'
import { useCallback, useRef, useSyncExternalStore } from 'react'

const CONFIRMED_AGE_KEY = 'hasConfirmedAge'
const AGE_CONFIRM_DURATION = 30 * 24 * 60 * 60 * 1000
const AGE_CONFIRM_EVENT = 'age-confirm-changed'

const WarningModal = dynamic(() => import('#components/home/warning/WarningModal'))

/** 读取当前是否应该显示弹窗 */
function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false // SSR 安全：服务端不弹窗
  const timestamp = Number(localStorage.getItem(CONFIRMED_AGE_KEY))
  const valid = Boolean(timestamp && Date.now() - timestamp < AGE_CONFIRM_DURATION)
  return !valid // true 表示需要显示弹窗
}

/** SSR 期间的快照（与 getSnapshot 返回类型一致） */
function getServerSnapshot(): boolean {
  return false
}

/** 订阅“年龄确认状态”变化 */
function subscribe(callback: () => void) {
  // 跨 Tab 更新时，原生 storage 事件会触发
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONFIRMED_AGE_KEY) callback()
  }
  // 同 Tab 内按钮点击后，我们派发自定义事件来触发回调
  const onCustom = () => callback()

  window.addEventListener('storage', onStorage)
  window.addEventListener(AGE_CONFIRM_EVENT, onCustom)

  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(AGE_CONFIRM_EVENT, onCustom)
  }
}

let hasOpened = false
const hasOpenedSubscribers = new Set<() => void>()

function markHasOpened() {
  if (!hasOpened && getSnapshot()) {
    hasOpened = true
    hasOpenedSubscribers.forEach(callback => callback())
  }
}

function getHasOpenedSnapshot(): boolean {
  return hasOpened
}

function getHasOpenedServerSnapshot(): boolean {
  return false
}

function subscribeHasOpened(callback: () => void) {
  const onStorage = () => {
    markHasOpened()
  }
  const onCustom = () => {
    markHasOpened()
  }

  hasOpenedSubscribers.add(callback)
  window.addEventListener('storage', onStorage)
  window.addEventListener(AGE_CONFIRM_EVENT, onCustom)
  markHasOpened()

  return () => {
    hasOpenedSubscribers.delete(callback)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(AGE_CONFIRM_EVENT, onCustom)
  }
}

export default function Warning() {
  // 用外部存储（localStorage）作为“单一事实来源”，不再在 effect 里 setState
  const isOpen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const hasOpened = useSyncExternalStore(
    subscribeHasOpened,
    getHasOpenedSnapshot,
    getHasOpenedServerSnapshot,
  )

  const handleConfirmAge = useCallback(() => {
    localStorage.setItem(CONFIRMED_AGE_KEY, String(Date.now()))
    // 同页内不会触发 storage 事件，手动通知订阅者
    window.dispatchEvent(new Event(AGE_CONFIRM_EVENT))
  }, [])

  const handleLeave = useCallback(() => {
    window.location.href = 'https://www.google.com'
  }, [])

  const shouldRender = isOpen || hasOpened
  if (!shouldRender) return null

  return (
    <WarningModal
      isOpen={isOpen}
      confirmButtonRef={confirmButtonRef}
      onConfirm={handleConfirmAge}
      onLeave={handleLeave}
    />
  )
}
