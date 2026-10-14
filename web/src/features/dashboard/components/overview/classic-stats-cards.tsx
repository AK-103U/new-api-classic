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
import { Link } from '@tanstack/react-router'
import {
  Activity,
  BarChart3,
  FileText,
  Gauge,
  History,
  Send,
  Timer,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { formatNumber, formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

interface ClassicStatsCardsProps {
  data: QuotaDataItem[]
  loading: boolean
  startTimestamp: number
  endTimestamp: number
}

interface StatItem {
  id: string
  title: string
  value: string
  icon: LucideIcon
  trend?: number[]
  trendColor: string
  walletLink?: boolean
}

interface StatGroup {
  title: string
  icon: LucideIcon
  className: string
  items: StatItem[]
}

function getTrend(
  data: QuotaDataItem[],
  key: 'quota' | 'token_used' | 'count'
) {
  const bucketCount = 12
  const buckets = Array.from({ length: bucketCount }, () => 0)
  const timestamps = data.map((item) => Number(item.created_at) || 0)
  if (!timestamps.length) return buckets

  let start = Infinity
  let end = -Infinity
  for (const timestamp of timestamps) {
    start = Math.min(start, timestamp)
    end = Math.max(end, timestamp)
  }
  if (start === end) {
    buckets[bucketCount - 1] = data.reduce(
      (sum, item) => sum + (Number(item[key]) || 0),
      0
    )
    return buckets
  }

  for (const item of data) {
    const timestamp = Number(item.created_at) || start
    const bucket = Math.min(
      bucketCount - 1,
      Math.max(
        0,
        Math.floor(((timestamp - start) / (end - start)) * bucketCount)
      )
    )
    buckets[bucket] += Number(item[key]) || 0
  }
  return buckets
}

function MiniTrend(props: { values?: number[]; color: string }) {
  const values = props.values
  if (!values?.length) return null

  const max = Math.max(...values, 1)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * 96
      const y = 34 - (value / max) * 30
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg
      className='h-10 w-24 shrink-0'
      viewBox='0 0 96 40'
      preserveAspectRatio='none'
      aria-hidden='true'
    >
      <polyline
        points={points}
        fill='none'
        stroke={props.color}
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

export function ClassicStatsCards(props: ClassicStatsCardsProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const totals = useMemo(
    () =>
      props.data.reduce(
        (result, item) => ({
          count: result.count + (Number(item.count) || 0),
          quota: result.quota + (Number(item.quota) || 0),
          tokens: result.tokens + (Number(item.token_used) || 0),
        }),
        { count: 0, quota: 0, tokens: 0 }
      ),
    [props.data]
  )
  const durationMinutes = Math.max(
    1,
    (props.endTimestamp - props.startTimestamp) / 60
  )
  const trends = useMemo(
    () => ({
      calls: getTrend(props.data, 'count'),
      quota: getTrend(props.data, 'quota'),
      tokens: getTrend(props.data, 'token_used'),
    }),
    [props.data]
  )

  const groups: StatGroup[] = [
    {
      title: t('Account Info'),
      icon: Wallet,
      className: 'bg-blue-50 dark:bg-blue-950/35',
      items: [
        {
          id: 'current-balance',
          title: t('Current Balance'),
          value: formatQuota(Number(user?.quota) || 0),
          icon: Wallet,
          trendColor: '#3b82f6',
          walletLink: true,
        },
        {
          id: 'historical-usage',
          title: t('Historical Usage'),
          value: formatQuota(Number(user?.used_quota) || 0),
          icon: History,
          trendColor: '#8b5cf6',
        },
      ],
    },
    {
      title: t('Usage'),
      icon: Activity,
      className: 'bg-green-50 dark:bg-green-950/35',
      items: [
        {
          id: 'account-request-count',
          title: t('Request Count'),
          value: formatNumber(Number(user?.request_count) || 0),
          icon: Send,
          trendColor: '#10b981',
        },
        {
          id: 'period-request-count',
          title: t('Request Count'),
          value: formatNumber(totals.count),
          icon: BarChart3,
          trend: trends.calls,
          trendColor: '#06b6d4',
        },
      ],
    },
    {
      title: t('Quota Distribution'),
      icon: Zap,
      className: 'bg-amber-50 dark:bg-amber-950/35',
      items: [
        {
          id: 'period-quota',
          title: t('Total Usage'),
          value: formatQuota(totals.quota),
          icon: Zap,
          trend: trends.quota,
          trendColor: '#f59e0b',
        },
        {
          id: 'period-tokens',
          title: t('Total Tokens'),
          value: formatNumber(totals.tokens),
          icon: FileText,
          trend: trends.tokens,
          trendColor: '#ec4899',
        },
      ],
    },
    {
      title: t('Performance'),
      icon: Gauge,
      className: 'bg-indigo-50 dark:bg-indigo-950/35',
      items: [
        {
          id: 'average-rpm',
          title: t('Average RPM'),
          value: (totals.count / durationMinutes).toFixed(3),
          icon: Timer,
          trend: trends.calls.map(
            (count) => count / Math.max(1, durationMinutes / 12)
          ),
          trendColor: '#6366f1',
        },
        {
          id: 'average-tpm',
          title: t('Average TPM'),
          value: (totals.tokens / durationMinutes).toFixed(3),
          icon: Gauge,
          trend: trends.tokens.map(
            (count) => count / Math.max(1, durationMinutes / 12)
          ),
          trendColor: '#f97316',
        },
      ],
    },
  ]

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {groups.map((group) => {
        const Icon = group.icon
        return (
          <section
            key={group.title}
            className={`${group.className} border-border/50 w-full overflow-hidden rounded-2xl border`}
            aria-label={group.title}
          >
            <h3 className='border-border/50 flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold'>
              <Icon className='size-4' aria-hidden='true' />
              {group.title}
            </h3>
            <div className='space-y-4 p-4'>
              {group.items.map((item) => {
                const ItemIcon = item.icon
                return (
                  <div
                    key={item.id}
                    className='flex min-w-0 items-center justify-between gap-2'
                  >
                    <div className='flex min-w-0 items-center gap-3'>
                      <span className='bg-background/70 text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full'>
                        <ItemIcon className='size-4' aria-hidden='true' />
                      </span>
                      <div className='min-w-0'>
                        <div className='text-muted-foreground text-xs'>
                          {item.title}
                        </div>
                        <div className='text-lg leading-tight font-semibold tabular-nums'>
                          {props.loading ? (
                            <Skeleton className='mt-1 h-6 w-20' />
                          ) : (
                            item.value
                          )}
                        </div>
                        {item.walletLink && (
                          <Link
                            to='/wallet'
                            className='text-primary mt-1 inline-block text-xs font-medium hover:underline'
                          >
                            {t('Add Quota')}
                          </Link>
                        )}
                      </div>
                    </div>
                    {!props.loading && (
                      <MiniTrend values={item.trend} color={item.trendColor} />
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
