/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  isRedirect,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSidebarData } from '@/hooks/use-sidebar-data'
import { useSidebarView } from '@/hooks/use-sidebar-view'
import { ROLE } from '@/lib/roles'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { Route as DashboardSectionRoute } from '@/routes/_authenticated/dashboard/$section'
import { useAuthStore } from '@/stores/auth-store'

import {
  canAccessDashboardSection,
  getDashboardSectionNavItems,
  getDashboardSectionRequiredRole,
  getVisibleDashboardSectionIds,
} from '../section-registry'

vi.mock('@visactor/react-vchart', () => ({
  VChart: () => null,
}))

function checkRouteAccess(section: string) {
  const beforeLoad = DashboardSectionRoute.options.beforeLoad
  if (!beforeLoad) throw new Error('Dashboard section route has no guard')
  return beforeLoad({ params: { section } } as never)
}

afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
})

async function renderSidebarForRole(role: number) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, { SidebarModulesAdmin: '' })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: role >= ROLE.ADMIN ? 'admin' : 'qwer',
    role,
  })

  function SidebarItems() {
    const sidebar = useSidebarView()
    return (
      <nav>
        {sidebar.navGroups.flatMap((group) =>
          group.items.flatMap((item) =>
            'url' in item && item.url ? (
              <span key={item.url} data-testid={`sidebar-${item.url}`}>
                {item.title}
              </span>
            ) : (
              []
            )
          )
        )}
      </nav>
    )
  }

  const router = createRouter({
    routeTree: createRootRoute({ component: SidebarItems }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('dashboard section navigation access', () => {
  it('hides Models and Users from regular-user section navigation', () => {
    const items = getDashboardSectionNavItems(i18next.t, {
      isAdmin: false,
    })

    expect(items.map((item) => item.url)).toEqual([
      '/dashboard/overview',
      '/dashboard/flow',
    ])
    expect(getVisibleDashboardSectionIds(false)).toEqual(['overview', 'flow'])
  })

  it('keeps every dashboard section visible to administrators', () => {
    const items = getDashboardSectionNavItems(i18next.t, {
      isAdmin: true,
    })

    expect(items.map((item) => item.url)).toEqual([
      '/dashboard/overview',
      '/dashboard/models',
      '/dashboard/flow',
      '/dashboard/users',
    ])
    expect(getVisibleDashboardSectionIds(true)).toEqual([
      'overview',
      'models',
      'flow',
      'users',
    ])
  })

  it('hides the Models sidebar link for regular users', async () => {
    await renderSidebarForRole(ROLE.USER)

    expect(
      await screen.findByTestId('sidebar-/dashboard/overview')
    ).toBeVisible()
    expect(screen.queryByTestId('sidebar-/dashboard/models')).toBeNull()
  })

  it('shows the Models sidebar link for administrators', async () => {
    await renderSidebarForRole(ROLE.ADMIN)

    expect(await screen.findByTestId('sidebar-/dashboard/models')).toBeVisible()
  })

  it('requires the administrator role for Models navigation', () => {
    expect(getDashboardSectionRequiredRole('models')).toBe(ROLE.ADMIN)
    expect(getDashboardSectionRequiredRole('flow')).toBeUndefined()

    const { result } = renderHook(() => useSidebarData())
    const modelsLink = result.current.navGroups
      .find((group) => group.id === 'general')
      ?.items.find((item) => 'url' in item && item.url === '/dashboard/models')
    expect(modelsLink).toMatchObject({ requiredRole: ROLE.ADMIN })
  })

  it('denies direct Models and Users access to regular users with a 403 redirect', () => {
    useAuthStore.getState().auth.setUser({
      id: 2,
      username: 'qwer',
      role: ROLE.USER,
    })

    for (const section of ['models', 'users']) {
      expect(canAccessDashboardSection(section, false)).toBe(false)
      try {
        checkRouteAccess(section)
        throw new Error(`Expected ${section} access to be denied`)
      } catch (error) {
        expect(isRedirect(error)).toBe(true)
        if (isRedirect(error)) expect(error.options.to).toBe('/403')
      }
    }
  })

  it('allows administrators to enter the Models route', () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'admin',
      role: ROLE.ADMIN,
    })

    expect(canAccessDashboardSection('models', true)).toBe(true)
    expect(() => checkRouteAccess('models')).not.toThrow()
  })
})
