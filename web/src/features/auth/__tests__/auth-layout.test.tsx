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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthLayout } from '../auth-layout'

function renderAuthLayout() {
  const rootRoute = createRootRoute({
    component: () => (
      <AuthLayout>
        <div data-auth-part='page'>
          <div data-auth-part='intro'>
            <h2>Sign in</h2>
          </div>
          <form aria-label='Sign-in form'>
            <label htmlFor='username'>Username</label>
            <input id='username' />
          </form>
        </div>
      </AuthLayout>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('authentication appearance shell', () => {
  it('keeps authentication content inside its scoped visual panel', async () => {
    renderAuthLayout()

    const main = await screen.findByRole('main')
    expect(main).toHaveAttribute('data-auth-skin', 'classic')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(
      screen.getByRole('form', { name: 'Sign-in form' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Username' })
    ).toBeInTheDocument()
  })
})
