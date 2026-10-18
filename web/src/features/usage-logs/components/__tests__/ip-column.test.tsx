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
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CellContext } from '@tanstack/react-table'
import { cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import type { UsageLog } from '../../data/schema'
import { useCommonLogsColumns } from '../columns/common-logs-columns'

const ipAddress = '203.0.113.42'
const i18n = createInstance()
const previousConfig = useSystemConfigStore.getState().config
let client: QueryClient

function makeLog(type: number, ip: string): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1,
    type,
    content: '',
    username: 'user',
    token_name: 'token',
    model_name: 'model',
    quota: 100,
    prompt_tokens: 1,
    completion_tokens: 1,
    use_time: 1,
    is_stream: false,
    channel: 1,
    channel_name: '',
    token_id: 1,
    group: 'default',
    ip,
    other: '',
    request_id: 'request-1',
    upstream_request_id: '',
  }
}

function IpCell(props: { type: number; ip: string; isAdmin: boolean }) {
  const column = useCommonLogsColumns(props.isAdmin, false).find(
    (item) => 'accessorKey' in item && item.accessorKey === 'ip'
  )
  if (!column || typeof column.cell !== 'function') {
    throw new Error('The log table must include an IP cell renderer')
  }
  return column.cell({
    row: { original: makeLog(props.type, props.ip) },
  } as CellContext<UsageLog, unknown>)
}

async function renderIpCell(props: {
  type: number
  ip?: string
  isAdmin?: boolean
}) {
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <IpCell
          type={props.type}
          ip={props.ip ?? ipAddress}
          isAdmin={props.isAdmin ?? false}
        />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en },
    interpolation: { escapeValue: false },
  })
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60_000 })
  client.setQueryData(
    ['pricing'],
    { data: [], vendors: [] },
    { updatedAt: Date.now() + 60_000 }
  )
})

afterEach(() => {
  cleanup()
  client.clear()
  useSystemConfigStore.getState().setConfig(previousConfig)
})

test.each([
  { type: 2, isAdmin: false, visible: true, label: 'consumer request' },
  { type: 5, isAdmin: false, visible: true, label: 'error request' },
  { type: 1, isAdmin: true, visible: true, label: 'admin top-up' },
  { type: 1, isAdmin: false, visible: false, label: 'user top-up' },
  { type: 3, isAdmin: true, visible: false, label: 'admin management log' },
])('shows IP only for Classic-supported log types ($label)', async (props) => {
  await renderIpCell(props)

  if (props.visible) {
    expect(screen.getByText(ipAddress)).toBeVisible()
  } else {
    expect(screen.queryByText(ipAddress)).not.toBeInTheDocument()
  }
})

test('leaves the cell blank when IP recording has not provided an address', async () => {
  await renderIpCell({ type: 2, ip: '' })

  expect(screen.queryByText(ipAddress)).not.toBeInTheDocument()
})
