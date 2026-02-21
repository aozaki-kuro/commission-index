'use client'

import { useEffect, useRef, useState } from 'react'

const getScrollThreshold = () => {
  const viewportRatio = window.innerWidth < 768 ? 0.2 : 0.25
  return Math.max(80, window.innerHeight * viewportRatio)
}

const isElementAtThreshold = (element: HTMLElement, threshold: number) => {
  const rect = element.getBoundingClientRect()
  return rect.top <= threshold && rect.bottom >= threshold
}

const getActiveSectionIdAtThreshold = (elements: HTMLElement[], threshold: number): string => {
  let activeId = ''

  for (const element of elements) {
    if (element.getBoundingClientRect().top <= threshold) {
      activeId = element.id
      continue
    }

    break
  }

  return activeId
}

const getHashTarget = (hash: string): HTMLElement | null => {
  if (!hash || !hash.startsWith('#')) return null

  const id = decodeURIComponent(hash.slice(1))
  if (!id) return null

  return document.getElementById(id)
}

const clearHash = () => {
  const { pathname, search, hash } = window.location
  if (!hash) return

  history.replaceState(null, '', `${pathname}${search}`)
}

const resetStaleHash = () => {
  const hash = window.location.hash
  if (!hash) return

  const element = getHashTarget(hash)
  if (!element) {
    clearHash()
    return
  }

  const rect = element.getBoundingClientRect()
  const isOffscreen = rect.bottom < 0 || rect.top > window.innerHeight
  if (isOffscreen) clearHash()
}

export const useCharacterScrollSpy = (
  titleIds: string[],
  introductionId = 'title-introduction',
) => {
  const [activeId, setActiveId] = useState<string>('')
  const rafId = useRef<number | null>(null)
  const thresholdRef = useRef<number>(0)
  const sectionElementsRef = useRef<HTMLElement[]>([])
  const introductionElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    introductionElementRef.current = document.getElementById(introductionId)
    sectionElementsRef.current = titleIds
      .map(id => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))
  }, [introductionId, titleIds])

  useEffect(() => {
    const updateThreshold = () => {
      thresholdRef.current = getScrollThreshold()
    }

    updateThreshold()
    window.addEventListener('resize', updateThreshold)

    return () => window.removeEventListener('resize', updateThreshold)
  }, [])

  useEffect(() => {
    const updateActiveId = () => {
      const introductionElement = introductionElementRef.current
      const threshold = thresholdRef.current
      const isAtIntroduction =
        introductionElement && isElementAtThreshold(introductionElement, threshold)

      if (window.scrollY === 0 || isAtIntroduction) {
        setActiveId('')
        resetStaleHash()
        return
      }

      const nextActiveId = getActiveSectionIdAtThreshold(sectionElementsRef.current, threshold)
      setActiveId(nextActiveId)
      resetStaleHash()
    }

    const handleScroll = () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(updateActiveId)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
      }
    }
  }, [introductionId, titleIds])

  return activeId
}
