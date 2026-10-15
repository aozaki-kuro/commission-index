import type { HomeSearchControls } from '@features/home/i18n/homeSearchControls'

/**
 * Imperatively render help popover content into a native popover container.
 * Content is static — renders once per container lifetime.
 */
export function renderHelpContent(
  container: HTMLElement,
  controls: HomeSearchControls,
): void {
  if (container.dataset.rendered === 'true')
    return
  container.dataset.rendered = 'true'
  container.textContent = ''

  const wrapper = el('div', 'space-y-3 p-4')

  // Title
  wrapper.append(
    el('h2', 'text-base font-bold text-gray-900 md:text-lg dark:text-gray-100', controls.searchHelpTitle),
  )

  // Intro
  wrapper.append(
    el('p', 'text-xs md:text-sm', controls.searchHelpIntro),
  )

  // Table container
  const tableWrap = el(
    'div',
    'max-h-[min(50dvh,22rem)] overflow-auto rounded-lg border border-gray-200/90 dark:border-gray-700/90',
  )

  const table = el(
    'table',
    'w-full min-w-[18rem] border-separate border-spacing-0 text-left text-xs/relaxed md:text-sm',
  )

  // thead
  const thead = el('thead', 'sticky top-0 bg-gray-100/90 text-gray-600 dark:bg-gray-800/90 dark:text-gray-300')
  const headRow = document.createElement('tr')
  headRow.append(
    el('th', 'px-3 py-2 font-semibold', controls.searchHelpSyntaxHeader),
    el('th', 'px-3 py-2 font-semibold', controls.searchHelpMeaningHeader),
  )
  thead.append(headRow)

  // tbody
  const tbody = el('tbody', 'divide-y divide-gray-200/80 dark:divide-gray-700/80')

  for (const row of controls.searchHelpRows) {
    const tr = document.createElement('tr')
    tr.className = 'align-top'

    // Syntax cell
    const syntaxTd = el('td', 'w-20 px-3 py-2.5')
    syntaxTd.append(
      el(
        'code',
        'rounded-sm bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 md:text-xs dark:bg-gray-800 dark:text-gray-200',
        row.syntax,
      ),
    )

    // Description cell
    const descTd = el('td', 'px-3 py-2.5 text-[11px] sm:text-xs md:text-sm')
    descTd.append(el('p', '', row.description))

    const exampleP = el('p', 'mt-0.5 wrap-break-word text-gray-500 dark:text-gray-400')
    exampleP.append(
      document.createTextNode(`${controls.searchHelpExampleLabel}: `),
      el(
        'code',
        'rounded-sm bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 md:text-xs dark:bg-gray-800 dark:text-gray-300',
        row.example,
      ),
    )
    descTd.append(exampleP)

    tr.append(syntaxTd, descTd)
    tbody.append(tr)
  }

  table.append(thead, tbody)
  tableWrap.append(table)
  wrapper.append(tableWrap)

  // Combined example
  const combinedP = el(
    'p',
    'text-[11px] wrap-break-word text-gray-500 sm:text-xs md:text-sm dark:text-gray-400',
  )
  combinedP.append(
    document.createTextNode(`${controls.searchHelpCombinedExampleLabel}: `),
    el(
      'code',
      'rounded-sm bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 md:text-xs dark:bg-gray-800 dark:text-gray-300',
      'blue hair | silver !sketch',
    ),
  )
  wrapper.append(combinedP)

  // Alias hint
  wrapper.append(
    el(
      'p',
      'text-[11px] wrap-break-word text-gray-500 sm:text-xs md:text-sm dark:text-gray-400',
      controls.searchHelpAliasHint,
    ),
  )

  // Close button
  const btnWrap = el('div', 'flex justify-end')
  const btn = el(
    'button',
    'rounded-md border border-gray-300/80 bg-white/85 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-600 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:outline-gray-300',
    controls.searchHelpClose,
  )
  btn.setAttribute('type', 'button')
  btn.addEventListener('click', () => {
    ;(container.closest('[popover]') as HTMLElement | null)?.hidePopover()
  })
  btnWrap.append(btn)
  wrapper.append(btnWrap)

  container.append(wrapper)
}

/** Create an element with className and optional text content. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  if (text != null)
    node.textContent = text
  return node
}
