// @vitest-environment jsdom
import {
  ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT,
  ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
} from '@features/home/commission/archivedCharactersState'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountArchivedCharactersToggle } from './archivedCharactersToggle'

const ARCHIVED_VISIBILITY_STORAGE_KEY = 'home:archived-visibility'

function renderPanel({ visibility = 'hidden' }: { visibility?: 'hidden' | 'visible' } = {}) {
  const visible = visibility === 'visible'
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-commission-view-active="true" data-archived-visibility="${visibility}">
      <section id="section-active" data-character-section="true" data-character-status="active"></section>
      <div data-archived-sections-placeholder="true" class="${visible ? 'hidden ' : ''}pb-8">
        <button type="button" data-load-archived-characters="true">Load</button>
      </div>
      <div data-archived-divider="true" class="${visible ? '' : 'hidden '}pb-12"></div>
      <div data-archived-sections-container="true" class="${visible ? '' : 'hidden'}">
        <section id="section-archived" data-character-section="true" data-character-status="archived"></section>
      </div>
    </div>
  `
}

const getPanel = () => document.querySelector<HTMLElement>('[data-commission-view-panel="character"]')!
const getContainer = () => document.querySelector<HTMLElement>('[data-archived-sections-container="true"]')!
const getDivider = () => document.querySelector<HTMLElement>('[data-archived-divider="true"]')!
const getPlaceholder = () => document.querySelector<HTMLElement>('[data-archived-sections-placeholder="true"]')!

function expectVisible(visible: boolean) {
  expect(getPanel().dataset.archivedVisibility).toBe(visible ? 'visible' : 'hidden')
  expect(getContainer().classList.contains('hidden')).toBe(!visible)
  expect(getDivider().classList.contains('hidden')).toBe(!visible)
  expect(getPlaceholder().classList.contains('hidden')).toBe(visible)
}

describe('mountArchivedCharactersToggle', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('button click shows the container and hides the placeholder', () => {
    renderPanel()
    const cleanup = mountArchivedCharactersToggle()

    document.querySelector<HTMLButtonElement>('[data-load-archived-characters="true"]')!.click()

    expectVisible(true)
    cleanup()
  })

  it('collapse request hides the container but keeps the archived sections in the DOM', () => {
    renderPanel({ visibility: 'visible' })
    const cleanup = mountArchivedCharactersToggle()

    window.dispatchEvent(new Event(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT))

    expectVisible(false)
    expect(getContainer().querySelector('#section-archived')).not.toBeNull()
    cleanup()
  })

  it('show request is applied synchronously', () => {
    renderPanel()
    const cleanup = mountArchivedCharactersToggle()

    window.dispatchEvent(new Event(ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT))

    expectVisible(true)
    cleanup()
  })

  it('restores saved visible state on mount', () => {
    renderPanel()
    window.sessionStorage.setItem(
      ARCHIVED_VISIBILITY_STORAGE_KEY,
      JSON.stringify({ pathname: '/', visibility: 'visible' }),
    )

    const cleanup = mountArchivedCharactersToggle()

    expectVisible(true)
    cleanup()
  })

  it('keeps a pre-paint visible state over a saved hidden state', () => {
    renderPanel({ visibility: 'visible' })
    window.sessionStorage.setItem(
      ARCHIVED_VISIBILITY_STORAGE_KEY,
      JSON.stringify({ pathname: '/', visibility: 'hidden' }),
    )

    const cleanup = mountArchivedCharactersToggle()

    expectVisible(true)
    cleanup()
  })

  it('state change event carries the new visibility', () => {
    renderPanel()
    const details: unknown[] = []
    const onStateChange = (event: Event) => {
      details.push((event as CustomEvent).detail)
    }
    window.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onStateChange)
    const cleanup = mountArchivedCharactersToggle()

    window.dispatchEvent(new Event(ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT))
    window.dispatchEvent(new Event(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT))

    expect(details).toEqual([
      { visibility: 'visible' },
      { visibility: 'hidden' },
    ])
    cleanup()
    window.removeEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onStateChange)
  })
})
