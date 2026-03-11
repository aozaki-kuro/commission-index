import type { AstroUserConfig } from 'astro'

export type AstroVitePlugin = Extract<
  NonNullable<NonNullable<AstroUserConfig['vite']>['plugins']>[number],
  { name: string }
>
