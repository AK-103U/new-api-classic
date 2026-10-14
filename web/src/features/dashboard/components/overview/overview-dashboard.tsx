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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { ModelsFilter } from '@/features/dashboard/components/models/models-filter-dialog'
import { AnnouncementsPanel } from '@/features/dashboard/components/overview/announcements-panel'
import { ApiInfoPanel } from '@/features/dashboard/components/overview/api-info-panel'
import { ClassicChartsPanel } from '@/features/dashboard/components/overview/classic-charts-panel'
import { ClassicStatsCards } from '@/features/dashboard/components/overview/classic-stats-cards'
import { FAQPanel } from '@/features/dashboard/components/overview/faq-panel'
import { UptimePanel } from '@/features/dashboard/components/overview/uptime-panel'
import { useDashboardContentVisibility } from '@/features/dashboard/hooks/use-status-data'
import {
  buildDefaultDashboardFilters,
  buildQueryParams,
  getSavedChartPreferences,
} from '@/features/dashboard/lib'
import type {
  DashboardChartPreferences,
  DashboardFilters,
} from '@/features/dashboard/types'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange } from '@/lib/time'
import { useAuthStore } from '@/stores/auth-store'

export function OverviewDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const queryClient = useQueryClient()
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)
  const contentVisibility = useDashboardContentVisibility()
  const [chartPreferences, setChartPreferences] =
    useState<DashboardChartPreferences>(() => getSavedChartPreferences())
  const [filters, setFilters] = useState<DashboardFilters>(() =>
    buildDefaultDashboardFilters(getSavedChartPreferences())
  )
  const [isRefreshing, setIsRefreshing] = useState(false)

  const timeRange = useMemo(
    () =>
      computeTimeRange(
        chartPreferences.defaultTimeRangeDays,
        filters.start_timestamp,
        filters.end_timestamp
      ),
    [
      chartPreferences.defaultTimeRangeDays,
      filters.end_timestamp,
      filters.start_timestamp,
    ]
  )
  const queryParams = useMemo(
    () => buildQueryParams(timeRange, filters),
    [filters, timeRange]
  )
  const quotaQuery = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'classic-console',
      isAdmin,
      queryParams,
    ],
    queryFn: async () =>
      requireServerSuccess(await getUserQuotaDates(queryParams, isAdmin)),
    select: (response) => (response.success ? (response.data ?? []) : []),
    staleTime: 60_000,
  })

  const greetingText = user?.username
    ? `👋 ${t('Welcome back!')} ${user.username}`
    : `👋 ${t('Welcome back!')}`
  const showApiInfoPanel = contentVisibility.apiInfo
  const showAnnouncementsPanel = contentVisibility.announcements
  const showFAQPanel = contentVisibility.faq
  const showUptimePanel = contentVisibility.uptimeKuma
  const showInfoPanels =
    showApiInfoPanel ||
    showAnnouncementsPanel ||
    showFAQPanel ||
    showUptimePanel

  const handleResetFilters = () => {
    const preferences = getSavedChartPreferences()
    setChartPreferences(preferences)
    setFilters(buildDefaultDashboardFilters(preferences))
  }
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        quotaQuery.refetch(),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'overview', 'classic-user-charts'],
        }),
      ])
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='text-2xl font-semibold tracking-tight'>
          {greetingText}
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <ModelsFilter
          preferences={chartPreferences}
          currentFilters={filters}
          onFilterChange={setFilters}
          onReset={handleResetFilters}
          trigger={
            <Button
              variant='default'
              size='icon'
              aria-label={t('Search')}
              className='size-9 rounded-full bg-emerald-500 hover:bg-emerald-600'
            >
              <Search aria-hidden='true' />
            </Button>
          }
        />
        <Button
          variant='default'
          size='icon'
          aria-label={t('Refresh')}
          onClick={() => void handleRefresh()}
          disabled={isRefreshing || quotaQuery.isFetching}
          className='size-9 rounded-full bg-blue-500 hover:bg-blue-600'
        >
          <RefreshCw
            className={
              isRefreshing || quotaQuery.isFetching ? 'animate-spin' : undefined
            }
            aria-hidden='true'
          />
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <ClassicStatsCards
            data={quotaQuery.data ?? []}
            loading={quotaQuery.isLoading}
            startTimestamp={timeRange.start_timestamp}
            endTimestamp={timeRange.end_timestamp}
          />

          <div
            className={`grid grid-cols-1 gap-4 ${showApiInfoPanel ? 'lg:grid-cols-4' : ''}`}
          >
            <ClassicChartsPanel
              data={quotaQuery.data ?? []}
              loading={quotaQuery.isLoading}
              isAdmin={isAdmin}
              startTimestamp={timeRange.start_timestamp}
              endTimestamp={timeRange.end_timestamp}
              timeGranularity={filters.time_granularity ?? 'hour'}
              hasApiInfoPanel={showApiInfoPanel}
            />
            {showApiInfoPanel && <ApiInfoPanel />}
          </div>

          {showInfoPanels && (
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-4'>
              {showAnnouncementsPanel && (
                <div className='lg:col-span-2'>
                  <AnnouncementsPanel />
                </div>
              )}
              {showFAQPanel && <FAQPanel />}
              {showUptimePanel && <UptimePanel />}
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
