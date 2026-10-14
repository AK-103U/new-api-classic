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
import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { PieChart } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTheme } from '@/context/theme-provider'
import { getUserQuotaDataByUsers } from '@/features/dashboard/api'
import {
  processChartData,
  processUserChartData,
} from '@/features/dashboard/lib'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { requireServerSuccess } from '@/lib/server-error-message'
import type { TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

type ChartTab =
  | 'consumption'
  | 'trend'
  | 'distribution'
  | 'ranking'
  | 'user-ranking'
  | 'user-trend'

interface ClassicChartsPanelProps {
  data: QuotaDataItem[]
  loading: boolean
  isAdmin: boolean
  startTimestamp: number
  endTimestamp: number
  timeGranularity: TimeGranularity
  hasApiInfoPanel: boolean
}

export function ClassicChartsPanel(props: ClassicChartsPanelProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<ChartTab>('consumption')
  const [themeReady, setThemeReady] = useState(false)

  useEffect(() => {
    let active = true
    const updateTheme = async () => {
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (module) => module.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      if (!active) return
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }
    void updateTheme()
    return () => {
      active = false
    }
  }, [resolvedTheme])

  const timeGranularity = props.timeGranularity
  const chartData = useMemo(
    () => processChartData(props.loading ? [] : props.data, timeGranularity, t),
    [props.data, props.loading, t, timeGranularity]
  )
  const userDataQuery = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'classic-user-charts',
      props.startTimestamp,
      props.endTimestamp,
    ],
    enabled: props.isAdmin && activeTab.startsWith('user-'),
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDataByUsers({
          start_timestamp: props.startTimestamp,
          end_timestamp: props.endTimestamp,
        })
      ),
    select: (response) => (response.success ? (response.data ?? []) : []),
    staleTime: 60_000,
  })
  const userChartData = useMemo(
    () =>
      processUserChartData(
        userDataQuery.isLoading ? [] : (userDataQuery.data ?? []),
        timeGranularity,
        t
      ),
    [timeGranularity, t, userDataQuery.data, userDataQuery.isLoading]
  )

  const chartSpec = {
    consumption: chartData.spec_line,
    trend: chartData.spec_model_line,
    distribution: chartData.spec_pie,
    ranking: chartData.spec_rank_bar,
    'user-ranking': userChartData.spec_user_rank,
    'user-trend': userChartData.spec_user_trend,
  }[activeTab]

  let chartContent: ReactNode
  if (
    props.loading ||
    (activeTab.startsWith('user-') && userDataQuery.isLoading)
  ) {
    chartContent = <Skeleton className='h-full w-full' />
  } else if (themeReady && chartSpec) {
    chartContent = (
      <VChart
        key={`${activeTab}:${resolvedTheme}:${props.data.length}`}
        spec={{
          ...chartSpec,
          theme: resolvedTheme === 'dark' ? 'dark' : 'light',
          background: 'transparent',
        }}
        option={VCHART_OPTION}
      />
    )
  } else {
    chartContent = null
  }

  const tabs: { value: ChartTab; label: string }[] = [
    { value: 'consumption', label: t('Quota Distribution') },
    { value: 'trend', label: t('Call Trend') },
    { value: 'distribution', label: t('Call Count Distribution') },
    { value: 'ranking', label: t('Call Count Ranking') },
    ...(props.isAdmin
      ? [
          {
            value: 'user-ranking' as const,
            label: t('User Consumption Ranking'),
          },
          { value: 'user-trend' as const, label: t('User Consumption Trend') },
        ]
      : []),
  ]

  return (
    <section
      className={`bg-card overflow-hidden rounded-2xl border shadow-xs ${props.hasApiInfoPanel ? 'lg:col-span-3' : ''}`}
      aria-label={t('Model Analytics')}
    >
      <header className='flex flex-col gap-3 border-b px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex items-center gap-2'>
          <IconBadge tone='chart-4' size='sm'>
            <PieChart />
          </IconBadge>
          <h3 className='text-sm font-semibold'>{t('Model Analytics')}</h3>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ChartTab)}
          className='max-w-full min-w-0'
        >
          <TabsList className='max-w-full flex-wrap justify-start'>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>
      <div className='h-80 p-2 sm:h-96'>{chartContent}</div>
    </section>
  )
}
