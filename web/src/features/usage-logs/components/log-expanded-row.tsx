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
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatLogQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { UsageLog } from '../data/schema'
import {
  getTieredBillingSummary,
  hasAnyCacheTokens,
  parseLogOther,
} from '../lib/format'
import { isPerCallBilling } from '../lib/utils'

interface LogExpandedRowProps {
  log: UsageLog
  isAdmin: boolean
}

function buildBillingProcessSummary(
  log: UsageLog,
  other: ReturnType<typeof parseLogOther>,
  t: (k: string) => string
): { summary: string; formula?: string } | null {
  if (log.type !== 2 || !other) return null

  const priceOpts = { digitsLarge: 4, digitsSmall: 6, abbreviate: false }
  const fmtPrice = (usd: number) => formatBillingCurrencyFromUSD(usd, priceOpts)

  const userGR = other.user_group_ratio
  const isUserGR = userGR != null && Number.isFinite(userGR) && userGR !== -1
  const effectiveGR = (isUserGR ? userGR : other.group_ratio) ?? 1
  const grLabel = isUserGR ? t('User Exclusive Ratio') : t('Group Ratio')
  const grText = `${grLabel} ${effectiveGR}x`

  // 1. 订阅抵扣
  if (other.billing_source === 'subscription') {
    const parts = [t('Subscription Billed')]
    if (other.subscription_plan_title) {
      parts.push(`${t('Plan')}: ${other.subscription_plan_title}`)
    }
    if (other.subscription_pre_consumed != null) {
      parts.push(`${t('Pre-consumed')}: ${formatLogQuota(other.subscription_pre_consumed)}`)
    }
    if (other.subscription_post_delta != null) {
      parts.push(`${t('Delta')}: ${formatLogQuota(other.subscription_post_delta)}`)
    }
    if (other.subscription_remain != null) {
      parts.push(`${t('Remaining')}: ${formatLogQuota(other.subscription_remain)}`)
    }
    return {
      summary: parts.join(' · '),
    }
  }

  // 2. 阶梯计费
  if (other.billing_mode === 'tiered_expr') {
    const tiered = getTieredBillingSummary(other)
    const tierName = tiered?.tier.label || other.matched_tier || t('Default')
    const priceList = tiered?.priceEntries
      .map((e) => `${t(e.shortLabel)} ${fmtPrice(e.price)}/${e.unit ? t(e.unit) : '1M'}`)
      .join(' · ')
    return {
      summary: `${t('Tiered Pricing')} [${tierName}] · ${grText}`,
      formula: priceList || undefined,
    }
  }

  // 3. 按次计费
  if (isPerCallBilling(other.model_price) && other.model_price != null) {
    const basePrice = fmtPrice(other.model_price)
    return {
      summary: `${t('Per-call')} ${basePrice} · ${grText}`,
      formula: `${basePrice} * ${effectiveGR} = ${formatLogQuota(log.quota)}`,
    }
  }

  // 4. 普通 Token 按量计费
  if (other.model_ratio != null) {
    const inputRatioPrice = other.model_ratio * 2.0
    const completionRatio = other.completion_ratio ?? 1.0
    const completionRatioPrice = inputRatioPrice * completionRatio

    const rates = [
      `${t('Model Ratio')}: ${other.model_ratio}x`,
      `${t('Completion Ratio')}: ${completionRatio}x`,
      grText,
      `${t('Input')}: ${fmtPrice(inputRatioPrice)}/1M`,
      `${t('Output')}: ${fmtPrice(completionRatioPrice)}/1M`,
    ]

    if (hasAnyCacheTokens(other) && other.cache_ratio != null && other.cache_ratio !== 1) {
      rates.push(`${t('Cache Read')}: ${fmtPrice(inputRatioPrice * other.cache_ratio)}/1M`)
    }

    const promptTokens = log.prompt_tokens || 0
    const completionTokens = log.completion_tokens || 0
    const formula = `(${t('Input')} ${promptTokens.toLocaleString()} / 1M * ${fmtPrice(inputRatioPrice)} + ${t('Output')} ${completionTokens.toLocaleString()} / 1M * ${fmtPrice(completionRatioPrice)}) * ${effectiveGR}x = ${formatLogQuota(log.quota)}`

    return {
      summary: rates.join(' · '),
      formula,
    }
  }

  return null
}

export function LogExpandedRow({ log, isAdmin }: LogExpandedRowProps) {
  const { t } = useTranslation()
  const other = parseLogOther(log.other)
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: true })
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopy = (text: string, key: string) => {
    setCopiedKey(key)
    copyToClipboard(text)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  const items: { label: string; value: React.ReactNode; copyable?: string; fullWidth?: boolean }[] = []

  // 1. 渠道信息 (管理员可见)
  if (isAdmin && log.channel) {
    items.push({
      label: t('Channel Info'),
      value: `#${log.channel} - ${log.channel_name || t('Unknown')}`,
      copyable: String(log.channel),
    })
  }

  // 2. Request ID
  if (log.request_id) {
    items.push({
      label: 'Request ID',
      value: log.request_id,
      copyable: log.request_id,
    })
  }

  // 3. 上游 Request ID
  if (log.upstream_request_id) {
    items.push({
      label: t('Upstream Request ID'),
      value: log.upstream_request_id,
      copyable: log.upstream_request_id,
    })
  }

  // 4. 客户端 IP
  if (log.ip) {
    items.push({
      label: t('Client IP'),
      value: log.ip,
      copyable: log.ip,
    })
  }

  // 5. 模型映射信息
  if (other?.is_model_mapped && other?.upstream_model_name) {
    items.push({
      label: t('Requested Model'),
      value: log.model_name,
    })
    items.push({
      label: t('Actual Model'),
      value: other.upstream_model_name,
    })
  }

  // 6. 缓存详情
  if (other?.cache_tokens || other?.cache_creation_tokens) {
    const parts: string[] = []
    if (other.cache_tokens) parts.push(`${t('Read')}: ${other.cache_tokens.toLocaleString()}`)
    if (other.cache_creation_tokens) parts.push(`${t('Write')}: ${other.cache_creation_tokens.toLocaleString()}`)
    items.push({
      label: t('Cache Tokens'),
      value: parts.join(' · '),
    })
  }

  // 7. 计费过程 (重点回归！)
  const billingProcess = buildBillingProcessSummary(log, other, t)
  if (billingProcess) {
    items.push({
      label: t('Billing Process'),
      value: (
        <div className='flex flex-col gap-0.5 text-xs font-mono'>
          <span className='font-normal text-foreground/90'>{billingProcess.summary}</span>
          {billingProcess.formula && (
            <span className='text-[11px] text-muted-foreground/80'>{billingProcess.formula}</span>
          )}
        </div>
      ),
      fullWidth: true,
    })
  }

  // 8. 流状态与错误
  if (other?.stream_status && other.stream_status.status !== 'ok') {
    items.push({
      label: t('Stream Status'),
      value: `${other.stream_status.status} (${other.stream_status.end_reason || 'unknown'})`,
    })
  }

  // 9. 失败/拦截原因 (若有)
  const rejectReason = (other as Record<string, unknown> | null)?.reject_reason as string | undefined
  if (other?.reason || rejectReason) {
    items.push({
      label: t('Failure Reason'),
      value: other?.reason || rejectReason,
      fullWidth: true,
    })
  }

  // 10. 日志内容 / 详情
  if (log.content && log.type !== 2) {
    items.push({
      label: t('Log Content'),
      value: log.content,
      fullWidth: true,
    })
  }

  if (items.length === 0) {
    return (
      <div className='py-2 px-4 text-xs text-muted-foreground italic'>
        {t('No additional details available')}
      </div>
    )
  }

  return (
    <div className='bg-muted/30 border-y border-border/60 py-3.5 px-6 text-xs transition-colors'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2.5'>
        {items.map((item) => {
          const isCopied = copiedKey === item.label && copiedText === item.copyable

          return (
            <div
              key={item.label}
              className={cn(
                'flex items-baseline gap-2.5 leading-relaxed',
                item.fullWidth && 'col-span-full'
              )}
            >
              <span className='w-24 shrink-0 font-medium text-muted-foreground/80'>
                {item.label}:
              </span>
              <span className='min-w-0 flex-1 font-mono break-all text-foreground/90 selection:bg-primary/20'>
                {item.value}
              </span>
              {item.copyable && (
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation()
                    if (item.copyable) {
                      handleCopy(item.copyable, item.label)
                    }
                  }}
                  className='text-muted-foreground/50 hover:text-foreground shrink-0 transition-colors'
                  title={t('Copy')}
                >
                  {isCopied ? (
                    <Check className='size-3.5 text-emerald-600' />
                  ) : (
                    <Copy className='size-3.5' />
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
