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
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { act, render, screen, within } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { usageLogSchema, type UsageLog } from '../../data/schema'
import { useCommonLogsColumns } from '../columns/common-logs-columns'

const i18n = createInstance()
let client: QueryClient
const baseLog = usageLogSchema.parse({
  id: 1,
  user_id: 2,
  created_at: 1788840000,
  type: 2,
  model_name: 'example-model',
  content: 'Example details',
  prompt_tokens: 1200,
  completion_tokens: 340,
  use_time: 4,
  is_stream: true,
  other: JSON.stringify({ group_ratio: 2, frt: 400 }),
})

function ColumnsPreview(props: { log: UsageLog }) {
  const columns = useCommonLogsColumns(false, false).filter(
    (column) =>
      'accessorKey' in column &&
      [
        'created_at',
        'type',
        'use_time',
        'prompt_tokens',
        'completion_tokens',
        'content',
      ].includes(column.accessorKey as string)
  )
  const table = useReactTable({
    data: [props.log],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext()
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} data-testid={cell.column.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: false,
    resources: Object.fromEntries(
      ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi', 'invalid_locale'].map(
        (language) => [language, { translation: { Tokens_usage: 'Tokens' } }]
      )
    ),
    interpolation: { escapeValue: false },
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {})
  client.setQueryData(['pricing'], { data: [], vendors: [] })
})
afterEach(() => client.clear())

function renderColumns(overrides: Partial<UsageLog> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ColumnsPreview log={{ ...baseLog, ...overrides }} />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

test('combines tokens and removes the standalone type and output columns', () => {
  renderColumns()
  expect(screen.getByRole('columnheader', { name: 'Tokens' })).toBeVisible()
  expect(
    screen.queryByRole('columnheader', { name: 'Input' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('columnheader', { name: 'Output' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('columnheader', { name: 'Type' })
  ).not.toBeInTheDocument()
  expect(screen.getByTestId('prompt_tokens')).toHaveTextContent('1,200 / 340')
})

test.each([
  { type: 2, label: 'Consume 2x' },
  { type: 1, label: 'Top-up' },
  { type: 5, label: 'Error' },
  { type: 6, label: 'Refund' },
  { type: 0, label: 'Unknown' },
])(
  'places $label before the details without adding it to the details button',
  ({ type, label }) => {
    renderColumns({ type })
    const cell = screen.getByTestId('content')
    const prefix = within(cell).getByText(label)
    const button = within(cell).getByRole('button')
    expect(prefix.closest('[data-slot="log-type-prefix"]')).toHaveClass(
      'hidden',
      'min-[641px]:inline-flex'
    )
    expect(
      prefix.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
    expect(button).not.toHaveTextContent(label)
  }
)

test.each([
  { prompt_tokens: 1200, completion_tokens: 0, expected: '1,200 / 0' },
  { prompt_tokens: 0, completion_tokens: 340, expected: '0 / 340' },
  { prompt_tokens: 0, completion_tokens: 0, expected: '-' },
])(
  'preserves token zero values ($prompt_tokens / $completion_tokens)',
  ({ expected, ...tokens }) => {
    renderColumns(tokens)
    expect(screen.getByTestId('prompt_tokens').textContent).toBe(expected)
  }
)

test.each([
  {
    name: 'split writes take precedence over the aggregate',
    prompt: 1200,
    other: {
      cache_tokens: 640,
      cache_creation_tokens_5m: 200,
      cache_creation_tokens_1h: 300,
      cache_creation_tokens: 999,
    },
    main: '1,200 / 0',
    cache: 'Cache↓ 640↑ 500',
  },
  {
    name: 'aggregate cache writes are retained',
    prompt: 1200,
    other: { cache_creation_tokens: 700 },
    main: '1,200 / 0',
    cache: '↑ 700',
  },
  {
    name: 'cache-only usage remains visible',
    prompt: 0,
    other: { cache_tokens: 640 },
    main: '0 / 0',
    cache: 'Cache↓ 640',
  },
])('$name', ({ prompt, other, main, cache }) => {
  renderColumns({
    prompt_tokens: prompt,
    completion_tokens: 0,
    other: JSON.stringify(other),
  })
  const cell = screen.getByTestId('prompt_tokens')
  expect(cell).toHaveTextContent(main)
  expect(cell).toHaveTextContent(cache)
})

test.each([
  ['en', '12,345 / 6,789'],
  ['zhCN', '12,345 / 6,789'],
  ['zhTW', '12,345 / 6,789'],
  ['fr', '12\u202f345 / 6\u202f789'],
  ['ru', '12\u00a0345 / 6\u00a0789'],
  ['ja', '12,345 / 6,789'],
  ['vi', '12.345 / 6.789'],
  ['invalid_locale', '12,345 / 6,789'],
])(
  'updates token formatting after switching to %s',
  async (language, expected) => {
    renderColumns({ prompt_tokens: 12345, completion_tokens: 6789 })
    await act(() => i18n.changeLanguage(language))
    expect(screen.getByTestId('prompt_tokens').textContent).toBe(expected)
  }
)

test('shows rounded output tokens per second immediately after Stream', () => {
  renderColumns({ completion_tokens: 101, use_time: 4 })
  const cell = screen.getByTestId('use_time')
  const stream = within(cell).getByText('Stream')
  expect(stream.nextElementSibling).toHaveTextContent('25 t/s')
  expect(within(cell).getByText('4 s')).toBeVisible()
  expect(within(cell).getByText('0.4 s')).toBeVisible()
})

test.each([
  { is_stream: false, use_time: 4, completion_tokens: 100 },
  { is_stream: true, use_time: 0, completion_tokens: 100 },
  { is_stream: true, use_time: 4, completion_tokens: 0 },
  { is_stream: true, use_time: 4, completion_tokens: Number.POSITIVE_INFINITY },
])(
  'does not invent throughput for non-stream or unavailable timing (%j)',
  (values) => {
    renderColumns(values)
    expect(
      within(screen.getByTestId('use_time')).queryByText(/t\/s/)
    ).not.toBeInTheDocument()
  }
)
