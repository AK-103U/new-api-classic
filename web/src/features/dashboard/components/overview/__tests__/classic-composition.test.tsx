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
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { OverviewDashboard } from '../overview-dashboard'

vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

vi.mock('@visactor/react-vchart', () => ({
  VChart: () => null,
}))

vi.mock('@visactor/vchart', () => ({
  ThemeManager: { setCurrentTheme: vi.fn() },
}))

let client: QueryClient

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'dashboard-user',
    role: 1,
    quota: 1000000,
    used_quota: 1000,
    request_count: 1,
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    switch (url) {
      case '/api/status':
        return {
          data: {
            data: {
              api_info_enabled: false,
              announcements_enabled: false,
              faq_enabled: false,
              uptime_kuma_enabled: false,
            },
          },
        }
      case '/api/data':
      case '/api/data/self':
        return {
          data: {
            success: true,
            data: [
              {
                created_at: Math.floor(Date.now() / 1000),
                count: 3,
                quota: 1200,
                token_used: 800,
                model_name: 'model-a',
              },
            ],
          },
        }
      default:
        throw new Error(`Unexpected dashboard request: ${url}`)
    }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
})

async function renderOverview() {
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewDashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('Classic dashboard overview composition', () => {
  it('renders grouped statistics and the Classic single-panel chart structure', async () => {
    await renderOverview()

    expect(
      await screen.findByRole('region', { name: 'Account Info' })
    ).toBeVisible()
    expect(screen.getByRole('region', { name: 'Usage' })).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Quota Distribution' })
    ).toBeVisible()
    expect(screen.getByRole('region', { name: 'Performance' })).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Model Analytics' })
    ).toBeVisible()
    expect(
      screen.getByRole('tab', { name: 'Quota Distribution' })
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Call Trend' })).toBeVisible()
    expect(
      screen.getByRole('tab', { name: 'Call Count Distribution' })
    ).toBeVisible()
    expect(
      screen.getByRole('tab', { name: 'Call Count Ranking' })
    ).toBeVisible()
    expect(screen.queryByText('Setup guide')).not.toBeInTheDocument()
    expect(screen.queryByText('Usage at a glance')).not.toBeInTheDocument()
    expect(screen.queryByText('Performance health')).not.toBeInTheDocument()
  })

  it('does not expose administrator-only user charts to regular users', async () => {
    await renderOverview()

    await screen.findByRole('region', { name: 'Account Info' })
    expect(
      screen.queryByRole('tab', { name: 'User Consumption Ranking' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'User Consumption Trend' })
    ).not.toBeInTheDocument()
  })

  it('keeps administrator user charts available', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'dashboard-admin',
      role: 10,
      quota: 1000000,
      used_quota: 1000,
      request_count: 1,
    })

    await renderOverview()

    await screen.findByRole('region', { name: 'Account Info' })
    expect(
      screen.getByRole('tab', { name: 'User Consumption Ranking' })
    ).toBeVisible()
    expect(
      screen.getByRole('tab', { name: 'User Consumption Trend' })
    ).toBeVisible()
  })
})
