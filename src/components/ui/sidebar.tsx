'use client'

import * as React from 'react'
import { cn } from '#lib/utils/cn'

const Sidebar = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <aside className={cn('hidden lg:block', className)} {...props} />
)

const SidebarContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-2', className)} {...props} />
)

const SidebarGroup = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-2', className)} {...props} />
)

const SidebarMenu = ({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
  <ul className={cn('space-y-2', className)} {...props} />
)

const SidebarMenuItem = ({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
  <li className={cn('relative', className)} {...props} />
)

const SidebarInset = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('min-w-0', className)} {...props} />
)

export { Sidebar, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarInset }
