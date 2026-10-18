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
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronRight, CircleHelp, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import {
  normalizeTierLabel,
  parseTaskTiersFromExpr,
} from '@/features/pricing/lib/billing-expr'
import {
  formatTaskUsageUnitPrice,
  getTaskUsagePriceUnitLabelKey,
} from '@/features/pricing/lib/dynamic-price'
import { pluginUsageSchema } from '@/features/pricing/lib/plugin-pricing'
import { taskUsageUnitLabel } from '@/features/pricing/lib/task-price-display'
import type { BillingUsageSchema } from '@/features/pricing/types'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { LOG_TYPE_ALL_VALUE, LOG_TYPE_ENUM } from '../../constants'
import type { UsageLog } from '../../data/schema'
import {
  formatModelName,
  decodeBillingExprB64,
  getTieredBillingSummary,
  hasAnyCacheTokens,
  parseLogOther,
  isViolationFeeLog,
  logTokenName,
  renderAuditContent,
  renderLogContent,
} from '../../lib/format'
import {
  isDisplayableLogType,
  isTimingLogType,
  isPerCallBilling,
} from '../../lib/utils'
import type { LogOtherData } from '../../types'
import { DetailsDialog } from '../dialogs/details-dialog'
import { LogCostDisplay } from '../log-cost-display'
import { ModelBadge } from '../model-badge'
import { useUsageLogsContext } from '../usage-logs-provider'

interface DetailSegment {
  text: string
  muted?: boolean
  danger?: boolean
}

function formatRatioCompact(ratio: number | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '-'
  return ratio % 1 === 0
    ? String(ratio)
    : ratio.toFixed(4).replace(/\.?0+$/, '')
}

function getGroupRatio(other: LogOtherData | null): number | null {
  const userGroupRatio = other?.user_group_ratio
  if (
    userGroupRatio != null &&
    userGroupRatio !== -1 &&
    Number.isFinite(userGroupRatio)
  ) {
    return userGroupRatio
  }

  const groupRatio = other?.group_ratio
  if (groupRatio != null && groupRatio !== 1 && Number.isFinite(groupRatio)) {
    return groupRatio
  }

  return null
}

function buildDetailSegments(
  log: UsageLog,
  other: LogOtherData | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
  isAdmin: boolean,
  language: string,
  usageSchema?: BillingUsageSchema
): DetailSegment[] {
  const segments = buildTypeDetailSegments(log, other, t, language, usageSchema)
  const adminSegments: DetailSegment[] = []
  if (isAdmin && other?.admin_info?.quota_saturation) {
    adminSegments.push({ text: t('Quota clamped'), danger: true })
  }
  return [...adminSegments, ...segments]
}

function buildTypeDetailSegments(
  log: UsageLog,
  other: LogOtherData | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
  language: string,
  usageSchema?: BillingUsageSchema
): DetailSegment[] {
  if (log.type === 1 || log.type === 3 || log.type === 7) {
    const text = renderAuditContent(other, t) ?? renderLogContent(other, t)
    return text ? [{ text }] : []
  }

  if (log.type === 6) {
    return [{ text: t('Async task refund') }]
  }

  if (log.type !== 2) return []

  const isViolation = isViolationFeeLog(other)
  if (isViolation) {
    const segments: DetailSegment[] = []
    segments.push({ text: t('Violation Fee'), danger: true })
    if (other?.violation_fee_code) {
      segments.push({
        text: other.violation_fee_code,
        muted: true,
      })
    }
    segments.push({
      text: `${t('Fee')}: ${formatLogQuota(other?.fee_quota ?? log.quota)}`,
      muted: true,
    })
    return segments
  }

  if (!other) return []

  const segments: DetailSegment[] = []

  const priceOpts = { digitsLarge: 4, digitsSmall: 6, abbreviate: false }
  const formatPrice = (price: number) =>
    `${formatBillingCurrencyFromUSD(price, priceOpts)}/M`
  const formatPriceCompact = (price: number) =>
    formatBillingCurrencyFromUSD(price, priceOpts)
  const formatPriceList = (prices: string[], showUnit: boolean) => {
    const text = prices.join(' / ')
    return showUnit ? `${text}/M` : text
  }
  const isTieredExpr = other.billing_mode === 'tiered_expr'
  const tieredSummary = getTieredBillingSummary(other)
  if (isTieredExpr && other.is_task) {
    const tiers = parseTaskTiersFromExpr(
      decodeBillingExprB64(other.expr_b64),
      usageSchema,
      true
    )
    const tier = tiers.find(
      (entry) =>
        Boolean(other.matched_tier) &&
        normalizeTierLabel(entry.label) ===
          normalizeTierLabel(other.matched_tier)
    )
    if (tier) {
      const prices = Object.entries(tier.unitPrices).map(([field, price]) => {
        const definition = usageSchema?.[field]
        const unitKey = getTaskUsagePriceUnitLabelKey(definition?.unit)
        const unitLabel = taskUsageUnitLabel(definition, language, t(unitKey))
        return `${field} ${formatTaskUsageUnitPrice(price, { tokenUnit: 'M' })}/${unitLabel}`
      })
      if (tier.constant > 0) {
        prices.push(
          `${t('Additional charge')} ${formatTaskUsageUnitPrice(tier.constant, { tokenUnit: 'M' })}/${t('request')}`
        )
      }
      segments.push({
        text: `${tier.label || t('Default')} · ${prices.join(' · ')}`,
      })
    } else {
      segments.push({
        text: `${t('Dynamic Pricing')} · ${other.matched_tier || t('Special billing expression')}`,
        muted: true,
      })
    }
  } else if (isTieredExpr) {
    if (tieredSummary) {
      const baseEntries = tieredSummary.priceEntries
        .filter((entry) => ['inputPrice', 'outputPrice'].includes(entry.field))
        .map((entry) => formatPriceCompact(entry.price))
      if (baseEntries.length > 0) {
        const tierLabel = tieredSummary.tier.label || t('Default')
        segments.push({
          text: `${tierLabel} · ${formatPriceList(baseEntries, true)}`,
        })
      }

      const cacheEntries = tieredSummary.priceEntries
        .filter((entry) =>
          ['cacheReadPrice', 'cacheCreatePrice', 'cacheCreate1hPrice'].includes(
            entry.field
          )
        )
        .map((entry) => {
          return formatPriceCompact(entry.price)
        })
      if (cacheEntries.length > 0) {
        segments.push({
          text: `${t('Cache')} ${formatPriceList(cacheEntries, false)}`,
          muted: true,
        })
      }

      const otherEntries = tieredSummary.priceEntries
        .filter(
          (entry) =>
            ![
              'inputPrice',
              'outputPrice',
              'cacheReadPrice',
              'cacheCreatePrice',
              'cacheCreate1hPrice',
            ].includes(entry.field)
        )
        .map((entry) =>
          entry.unit
            ? `${tieredSummary.tier.label || t('Default')} · ${t(entry.shortLabel)} ${formatPriceCompact(entry.price)}/${t(entry.unit)}`
            : `${t(entry.shortLabel)} ${formatPrice(entry.price)}`
        )
      if (otherEntries.length > 0) {
        segments.push({
          text: otherEntries.join(' · '),
          muted: true,
        })
      }
    } else {
      segments.push({
        text: `${t('Dynamic Pricing')} · ${other.matched_tier || t('Special billing expression')}`,
        muted: true,
      })
    }
  } else {
    const modelPrice = other.model_price
    const isPerCall = isPerCallBilling(modelPrice)
    if (isPerCall && modelPrice != null) {
      segments.push({
        text: `${t('Per-call')} · ${formatBillingCurrencyFromUSD(modelPrice, priceOpts)}`,
      })
    } else if (other.model_ratio != null) {
      const inputPriceUSD = other.model_ratio * 2.0
      const baseEntries = [formatPriceCompact(inputPriceUSD)]
      if (other.completion_ratio != null) {
        baseEntries.push(
          formatPriceCompact(inputPriceUSD * other.completion_ratio)
        )
      }
      segments.push({
        text: `${t('Standard')} · ${formatPriceList(baseEntries, true)}`,
      })

      if (hasAnyCacheTokens(other)) {
        const cacheEntries = [
          other.cache_ratio != null && other.cache_ratio !== 1
            ? formatPriceCompact(inputPriceUSD * other.cache_ratio)
            : null,
          other.cache_creation_ratio != null && other.cache_creation_ratio !== 1
            ? formatPriceCompact(inputPriceUSD * other.cache_creation_ratio)
            : null,
          other.cache_creation_ratio_1h != null &&
          other.cache_creation_ratio_1h !== 0
            ? formatPriceCompact(inputPriceUSD * other.cache_creation_ratio_1h)
            : null,
        ].filter(Boolean) as string[]

        if (cacheEntries.length > 0) {
          segments.push({
            text: `${t('Cache')} ${formatPriceList(cacheEntries, false)}`,
            muted: true,
          })
        }
      }
    } else {
      const userGroupRatio = other.user_group_ratio
      const groupRatio = other.group_ratio
      const isUserGroup =
        userGroupRatio != null &&
        Number.isFinite(userGroupRatio) &&
        userGroupRatio !== -1
      const effectiveRatio = isUserGroup ? userGroupRatio : groupRatio
      const ratioLabel = isUserGroup
        ? t('User Exclusive Ratio')
        : t('Group Ratio')

      if (effectiveRatio != null && Number.isFinite(effectiveRatio)) {
        segments.push({
          text: `${ratioLabel} ${formatRatioCompact(effectiveRatio)}x`,
        })
      }
    }
  }

  if (other.is_system_prompt_overwritten) {
    segments.push({
      text: t('System Prompt Override'),
      danger: true,
    })
  }

  return segments
}

function getEffectiveGroupRatio(other: LogOtherData | null): number {
  const userGroupRatio = other?.user_group_ratio
  if (
    userGroupRatio != null &&
    userGroupRatio !== -1 &&
    Number.isFinite(userGroupRatio)
  ) {
    return userGroupRatio
  }

  const groupRatio = other?.group_ratio
  if (groupRatio != null && Number.isFinite(groupRatio)) {
    return groupRatio
  }

  return 1
}

function formatGroupRatio(ratio: number): string {
  return ratio % 1 === 0
    ? `${ratio}x`
    : `${ratio.toFixed(4).replace(/\.?0+$/, '')}x`
}

/**
 * Classic Semi UI pill tag for Log Type
 */
function renderClassicTypeTag(
  type: number,
  other: LogOtherData | null,
  t: (k: string) => string
) {
  switch (type) {
    case 1:
      return (
        <span className='inline-flex items-center justify-center rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-normal text-cyan-700 shadow-2xs dark:bg-cyan-950/40 dark:text-cyan-300'>
          {t('Top-up')}
        </span>
      )
    case 2: {
      const ratio = getEffectiveGroupRatio(other)
      const ratioStr = formatGroupRatio(ratio)
      return (
        <span className='inline-flex items-center justify-center whitespace-nowrap rounded-full bg-lime-100/70 px-2.5 py-0.5 text-xs font-normal text-lime-800 shadow-2xs dark:bg-lime-950/40 dark:text-lime-300'>
          {t('Consume')} {ratioStr}
        </span>
      )
    }
    case 3:
      return (
        <span className='inline-flex items-center justify-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-normal text-orange-700 shadow-2xs dark:bg-orange-950/40 dark:text-orange-300'>
          {t('Manage')}
        </span>
      )
    case 4:
      return (
        <span className='inline-flex items-center justify-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-normal text-purple-700 shadow-2xs dark:bg-purple-950/40 dark:text-purple-300'>
          {t('System')}
        </span>
      )
    case 5:
      return (
        <span className='inline-flex items-center justify-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-normal text-rose-700 shadow-2xs dark:bg-rose-950/40 dark:text-rose-300'>
          {t('Error')}
        </span>
      )
    case 6:
      return (
        <span className='inline-flex items-center justify-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-normal text-teal-700 shadow-2xs dark:bg-teal-950/40 dark:text-teal-300'>
          {t('Refund')}
        </span>
      )
    default:
      return (
        <span className='inline-flex items-center justify-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-600 shadow-2xs dark:bg-neutral-800 dark:text-neutral-400'>
          {t('Unknown')}
        </span>
      )
  }
}

function getTimingBadgeColor(timeSec: number): string {
  if (timeSec < 100) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  }
  if (timeSec < 300) {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  }
  return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
}

function getFrtBadgeColor(frtSec: number): string {
  if (frtSec < 3) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  }
  if (frtSec < 10) {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  }
  return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
}

/**
 * Classic combined pill badges for UseTime / FirstResponseTime / Stream
 */
function renderClassicTimingCell(
  useTimeSec: number,
  _completionTokens: number,
  isStream: boolean,
  frtMs: number | undefined,
  _streamStatus: unknown,
  t: (k: string) => string
) {
  const time = Math.round(useTimeSec)
  const timeColor = getTimingBadgeColor(time)

  const frtSec = frtMs != null && frtMs > 0 ? (frtMs / 1000).toFixed(1) : null
  const frtColor = frtSec != null ? getFrtBadgeColor(Number(frtSec)) : ''

  return (
    <div className='flex items-center gap-1 font-mono text-xs whitespace-nowrap'>
      <span className={cn('rounded-full px-1.5 py-0.5 font-medium shadow-2xs', timeColor)}>
        {time} s
      </span>
      {isStream && frtSec && (
        <span className={cn('rounded-full px-1.5 py-0.5 font-medium shadow-2xs', frtColor)}>
          {frtSec} s
        </span>
      )}
      {isStream ? (
        <span className='rounded-full bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 shadow-2xs dark:bg-blue-950/40 dark:text-blue-300'>
          {t('Stream')}
        </span>
      ) : (
        <span className='rounded-full bg-purple-50 px-1.5 py-0.5 font-medium text-purple-700 shadow-2xs dark:bg-purple-950/40 dark:text-purple-300'>
          {t('Non-stream')}
        </span>
      )}
    </div>
  )
}

export function useCommonLogsColumns(
  isAdmin: boolean,
  isRoot: boolean,
  showBillingSource = false
): ColumnDef<UsageLog>[] {
  const { t } = useTranslation()

  return useMemo(() => {
    const columns: ColumnDef<UsageLog>[] = [
      // 1. Time (纯时间，不包含类型)
      {
        accessorKey: 'created_at',
        header: t('Time'),
        cell: function TimeCell({ row }) {
          const timestamp = row.getValue('created_at') as number
          const isExpanded = row.getIsExpanded()

          return (
            <div className='inline-flex items-center gap-1 font-mono text-xs text-foreground/80 tabular-nums'>
              <ChevronRight
                className={cn(
                  'text-muted-foreground/60 size-3.5 shrink-0 transition-transform duration-200',
                  isExpanded && 'rotate-90'
                )}
                aria-hidden='true'
              />
              <span className='whitespace-nowrap'>
                {formatTimestampToDate(timestamp)}
              </span>
            </div>
          )
        },
        filterFn: (row, _id, value) => {
          if (!Array.isArray(value) || value.length === 0) return true
          if (value.includes(LOG_TYPE_ALL_VALUE)) return true
          return value.includes(String(row.original.type))
        },
        enableHiding: false,
        size: 155,
      },
    ]

    // 2. Channel (管理员：蓝色小圆形数字 Badge)
    if (isAdmin) {
      columns.push({
        id: 'channel',
        header: t('Channel'),
        accessorFn: (row) => row.channel,
        cell: function ChannelCell({ row }) {
          const { sensitiveVisible } = useUsageLogsContext()
          const log = row.original
          if (!isDisplayableLogType(log.type) || !log.channel) return null

          const other = parseLogOther(log.other)
          const affinity = other?.admin_info?.channel_affinity
          const rawUseChannel = other?.admin_info?.use_channel ?? []
          const useChannel = Array.isArray(rawUseChannel)
            ? rawUseChannel.map(String).filter(Boolean)
            : []
          const hasRetryChain = useChannel.length > 1
          const channelChain = hasRetryChain
            ? useChannel.join(' → ')
            : undefined
          const channelDisplay = log.channel_name
            ? `${log.channel_name} #${log.channel}`
            : `#${log.channel}`
          const multiKeyIndex = other?.admin_info?.multi_key_index

          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={<div className='inline-flex items-center gap-1 cursor-pointer' />}
                >
                  <span className='inline-flex size-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 shadow-2xs dark:bg-blue-950 dark:text-blue-300'>
                    {log.channel}
                  </span>
                  {affinity && (
                    <Sparkles className='size-3 fill-amber-500 text-amber-500' />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <div className='space-y-1 text-xs'>
                    <p className='font-medium'>
                      {sensitiveVisible ? channelDisplay : `#${log.channel}`}
                    </p>
                    {channelChain && (
                      <p className='text-muted-foreground'>
                        {t('Chain')}: {channelChain}
                      </p>
                    )}
                    {typeof multiKeyIndex === 'number' && (
                      <p className='text-muted-foreground'>
                        Key #{multiKeyIndex}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        size: 60,
      })

      // 3. User (管理员：圆形头像 + 用户名)
      columns.push({
        id: 'user',
        header: t('User'),
        accessorFn: (row) => row.username,
        cell: function UserCell({ row }) {
          const {
            sensitiveVisible,
            setSelectedUserId,
            setUserInfoDialogOpen,
          } = useUsageLogsContext()
          const log = row.original
          if (!log.username) return null

          return (
            <button
              type='button'
              className='inline-flex items-center gap-1.5 text-left text-xs hover:underline'
              onClick={(e) => {
                e.stopPropagation()
                setSelectedUserId(log.user_id)
                setUserInfoDialogOpen(true)
              }}
            >
              <Avatar className='size-5'>
                <AvatarFallback
                  className='text-[10px] font-semibold'
                  style={
                    sensitiveVisible
                      ? getUserAvatarStyle(log.username)
                      : undefined
                  }
                >
                  {sensitiveVisible
                    ? getUserAvatarFallback(log.username)
                    : '•'}
                </AvatarFallback>
              </Avatar>
              <span className='max-w-[100px] truncate'>
                {sensitiveVisible ? log.username : '••••'}
              </span>
            </button>
          )
        },
        size: 100,
      })
    }

    // 4. Token (纯令牌胶囊，不挂分组)
    columns.push({
      accessorKey: 'token_name',
      header: t('Token'),
      cell: function TokenNameCell({ row }) {
        const { sensitiveVisible } = useUsageLogsContext()
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null

        const tokenName = logTokenName(log, t)
        if (!tokenName) return null
        const displayName = sensitiveVisible ? tokenName : '••••'

        return (
          <span
            title={sensitiveVisible ? tokenName : undefined}
            className='inline-flex max-w-[120px] items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700 shadow-2xs dark:bg-neutral-800 dark:text-neutral-300'
          >
            <span className='truncate'>{displayName}</span>
          </span>
        )
      },
      size: 110,
    })

    // 5. Group (独立成列)
    columns.push({
      accessorKey: 'group',
      header: t('Group'),
      cell: function GroupCell({ row }) {
        const { sensitiveVisible } = useUsageLogsContext()
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null

        const other = parseLogOther(log.other)
        const group = log.group || other?.group
        if (!group) return null

        const groupRatio = getGroupRatio(other)
        const isVip = group.toLowerCase().includes('vip')

        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-normal whitespace-nowrap shadow-2xs',
              isVip
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
            )}
          >
            <span>{sensitiveVisible ? group : '••••'}</span>
            {groupRatio != null && groupRatio !== 1 && (
              <span className='opacity-70 text-[10px]'>
                ({formatRatioCompact(groupRatio)}x)
              </span>
            )}
          </span>
        )
      },
      size: 85,
    })

    // 6. Type (独立成列)
    columns.push({
      accessorKey: 'type',
      header: t('Type'),
      cell: ({ row }) => {
        const log = row.original
        const other = parseLogOther(log.other)
        return renderClassicTypeTag(log.type, other, t)
      },
      size: 95,
    })

    // 7. Model (经典黄色圆角药丸)
    columns.push({
      accessorKey: 'model_name',
      header: t('Model'),
      cell: function ModelCell({ row }) {
        const log = row.original
        if (!isDisplayableLogType(log.type) || !log.model_name) return null
        const modelInfo = formatModelName(log)

        return (
          <div className='flex max-w-[210px] items-center'>
            <ModelBadge
              modelName={modelInfo.name}
              actualModel={modelInfo.actualModel}
              responseModel={modelInfo.responseModel}
              className='h-6 border-0 bg-transparent px-0 py-0 text-xs font-normal text-foreground shadow-none'
            />
          </div>
        )
      },
      size: 205,
    })

    // 8. Time/first word (组合胶囊：用时 + 首字 + 流)
    columns.push({
      accessorKey: 'use_time',
      header: t('Time/first word'),
      cell: ({ row }) => {
        const log = row.original
        if (!isTimingLogType(log.type)) return null
        const other = parseLogOther(log.other)

        return renderClassicTimingCell(
          log.use_time || 0,
          log.completion_tokens || 0,
          log.is_stream,
          other?.frt,
          other?.stream_status,
          t
        )
      },
      size: 160,
    })

    // 9. Input (提示Tokens，独立成列)
    columns.push({
      accessorKey: 'prompt_tokens',
      header: () => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className='inline-flex cursor-help items-center gap-1' />}
            >
              {t('Input')}
              <CircleHelp
                className='text-muted-foreground size-3'
                aria-hidden='true'
              />
            </TooltipTrigger>
            <TooltipContent className='max-w-xs text-xs'>
              {t(
                'According to Anthropic guidelines, prompt tokens exclude cached reads/writes.'
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      cell: ({ row }) => {
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null
        const other = parseLogOther(log.other)
        const cacheRead = other?.cache_tokens || 0
        const cacheWrite =
          (other?.cache_creation_tokens_5m || 0) +
            (other?.cache_creation_tokens_1h || 0) ||
          other?.cache_creation_tokens ||
          0

        return (
          <div className='flex flex-col font-mono text-xs tabular-nums text-foreground/80'>
            <span>{log.prompt_tokens.toLocaleString()}</span>
            {(cacheRead > 0 || cacheWrite > 0) && (
              <span className='text-[10px] text-muted-foreground whitespace-nowrap'>
                {cacheRead > 0 && `读 ${cacheRead.toLocaleString()} `}
                {cacheWrite > 0 && `写 ${cacheWrite.toLocaleString()}`}
              </span>
            )}
          </div>
        )
      },
      size: 80,
    })

    // 10. Output (补全Tokens，独立成列)
    columns.push({
      accessorKey: 'completion_tokens',
      header: t('Output'),
      cell: ({ row }) => {
        const log = row.original
        if (!isDisplayableLogType(log.type) || !log.completion_tokens) {
          return <span className='text-muted-foreground/40 font-mono text-xs'>-</span>
        }
        return (
          <span className='font-mono text-xs tabular-nums text-foreground/80'>
            {log.completion_tokens.toLocaleString()}
          </span>
        )
      },
      size: 75,
    })

    // 11. Cost (花费金额)
    columns.push({
      accessorKey: 'quota',
      header: t('Cost'),
      cell: ({ row }) => {
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null
        const quota = row.getValue('quota') as number
        const other = parseLogOther(log.other)
        return (
          <LogCostDisplay
            quota={quota}
            other={other}
            showBillingSource={showBillingSource}
          />
        )
      },
      size: 85,
    })

    // 12. IP
    columns.push({
      accessorKey: 'ip',
      header: () => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className='inline-flex cursor-help items-center gap-1' />}
            >
              {t('IP')}
              <CircleHelp
                className='text-muted-foreground size-3'
                aria-hidden='true'
              />
            </TooltipTrigger>
            <TooltipContent className='max-w-xs text-xs'>
              {t(
                'IP is recorded for usage and error logs only when the user enables IP logging'
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      cell: ({ row }) => {
        const log = row.original
        const shouldShowIp =
          log.type === LOG_TYPE_ENUM.CONSUME ||
          log.type === LOG_TYPE_ENUM.ERROR ||
          (isAdmin && log.type === LOG_TYPE_ENUM.TOPUP)

        if (!shouldShowIp || !log.ip) return null

        return (
          <StatusBadge
            label={log.ip}
            variant='orange'
            copyText={log.ip}
            size='sm'
            showDot={false}
            className='rounded-full bg-amber-50/80 px-2.5 py-0 text-xs font-normal text-amber-800 shadow-2xs dark:bg-amber-950/40 dark:text-amber-300'
          />
        )
      },
      meta: { label: t('IP') },
      size: 125,
    })

    // 13. Details (详情内容)
    columns.push({
      accessorKey: 'content',
      header: t('Details'),
      cell: function DetailsCell({ row }) {
        const { t, i18n } = useTranslation()
        const [dialogOpen, setDialogOpen] = useState(false)
        const log = row.original
        const other = parseLogOther(log.other)

        const pricingData = usePricingData(
          log.type === 2 &&
            other?.is_task === true &&
            other.billing_mode === 'tiered_expr'
        )
        const usageSchema = pluginUsageSchema(
          pricingData.models.find(
            (model) => model.model_name === log.model_name
          ),
          other?.admin_info?.task_plugin?.key
        )
        const segments = buildDetailSegments(
          log,
          other,
          t,
          isAdmin,
          i18n.language,
          usageSchema
        )
        const summaryText =
          segments.map((s) => s.text).join(' · ') ||
          (renderLogContent(other, t) ?? log.content)

        return (
          <div className='flex items-center gap-1 text-xs'>
            <button
              type='button'
              className='max-w-[200px] truncate text-left text-muted-foreground hover:text-foreground hover:underline'
              onClick={() => setDialogOpen(true)}
              title={summaryText}
            >
              {summaryText || '—'}
            </button>
            {dialogOpen && (
              <DetailsDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                log={log}
                isAdmin={isAdmin}
                isRoot={isRoot}
              />
            )}
          </div>
        )
      },
      size: 200,
    })

    return columns
  }, [isAdmin, isRoot, showBillingSource, t])
}
