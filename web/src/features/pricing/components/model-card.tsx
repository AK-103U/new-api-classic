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
import { memo, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Card } from '@/components/ui/card'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import {
  getCardExamplePrice,
  getDynamicDisplayGroupRatio,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import { formatPrice, formatRequestPrice } from '../lib/price'
import { taskPriceLabel, taskUsageUnitLabel } from '../lib/task-price-display'
import type { PricingModel, PriceType, TokenUnit } from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelPerfBadge, type ModelPerfBadgeData } from './model-perf-badge'

export interface ModelCardProps {
  model: PricingModel
  onClick: (modelName: string) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  perf?: ModelPerfBadgeData
}

export const ModelCard = memo(function ModelCard(props: ModelCardProps) {
  const { t, i18n } = useTranslation()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const priceRate = props.priceRate ?? 1
  const usdExchangeRate = props.usdExchangeRate ?? 1
  const showRechargePrice = props.showRechargePrice ?? false
  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
  const tags = parseTags(props.model.tags)
  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 28) : null
  const initial = props.model.model_name?.charAt(0).toUpperCase() || '?'
  const isUnconfiguredTaskUsage = isUnconfiguredTaskUsageModel(props.model)
  const billingTime = useBillingTime(props.model.billing_expr)
  const currency = useSystemConfigStore((state) => state.config.currency)
  const dynamicPriceOptions = useMemo(
    () => ({
      now: billingTime === undefined ? undefined : new Date(billingTime),
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      groupRatioMultiplier: getDynamicDisplayGroupRatio(
        props.model,
        props.selectedGroup
      ),
    }),
    [
      props.model,
      props.selectedGroup,
      billingTime,
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
    ]
  )
  const dynamicSummary = useMemo(
    () => getDynamicPricingSummary(props.model, dynamicPriceOptions),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.model, dynamicPriceOptions, currency]
  )
  const cardExamplePrice = useMemo(
    () => getCardExamplePrice(props.model, dynamicPriceOptions),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.model, dynamicPriceOptions, currency]
  )
  let priceSummary: ReactNode
  if (dynamicSummary) {
    const cacheReadEntries = dynamicSummary.secondaryEntries.filter(
      (entry) => entry.field === 'cacheReadPrice' && entry.unit === 'token'
    )
    if (dynamicSummary.isSpecialExpression) {
      priceSummary = (
        <div className='col-span-full min-w-0'>
          <span className='text-warning'>
            {t('Special billing expression')}
          </span>
          <code className='text-muted-foreground mt-1 line-clamp-2 block font-mono text-xs break-all'>
            {dynamicSummary.rawExpression}
          </code>
        </div>
      )
    } else if (
      dynamicSummary.primaryEntries.length > 0 ||
      cacheReadEntries.length > 0
    ) {
      priceSummary = (
        <>
          {[
            dynamicSummary.primaryEntries.slice(
              0,
              dynamicSummary.providerCount ? 2 : undefined
            ),
            cacheReadEntries,
          ]
            .flat()
            .map((entry) => {
              const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
              const unitLabel = taskUsageUnitLabel(
                entry,
                i18n.language,
                unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
              )
              let label: ReactNode = null
              if (entry.labelKind !== 'schema') {
                label = t(entry.shortLabel)
              } else {
                label = taskPriceLabel(
                  entry.description,
                  entry.shortLabel,
                  i18n.language
                )
              }
              return (
                <div
                  key={entry.key}
                  className={cn(
                    'flex min-w-0 flex-col gap-1',
                    dynamicSummary.isTaskUsage && 'col-span-full'
                  )}
                >
                  {label && (
                    <span className='text-muted-foreground text-xs break-words whitespace-normal'>
                      {label}
                    </span>
                  )}
                  <span className='flex flex-wrap items-baseline gap-x-1 font-mono text-sm font-semibold tabular-nums'>
                    <span>{entry.formattedRange ?? entry.formatted}</span>
                    <span className='text-muted-foreground text-xs font-normal whitespace-nowrap'>
                      {' '}
                      / {unitLabel}
                    </span>
                  </span>
                </div>
              )
            })}
          {dynamicSummary.isTimePricing && (
            <span className='text-muted-foreground col-span-full text-xs'>
              {t('Current period price')}
            </span>
          )}
          {dynamicSummary.isMixedBilling && (
            <span className='text-muted-foreground col-span-full text-xs'>
              {t('Token or per-call pricing')}
            </span>
          )}
          {cardExamplePrice && (
            <span className='text-muted-foreground col-span-full text-xs break-words'>
              {cardExamplePrice.label} ≈ {cardExamplePrice.formatted}
            </span>
          )}
          {dynamicSummary.isTaskUsage &&
            dynamicSummary.tier?.label &&
            !dynamicSummary.primaryEntries.some(
              (entry) => entry.formattedRange
            ) && (
              <span className='text-muted-foreground col-span-full text-xs break-words'>
                ({dynamicSummary.tier.label})
              </span>
            )}
        </>
      )
    } else {
      priceSummary = (
        <span className='text-muted-foreground col-span-full'>
          {dynamicSummary.hasUnconfiguredProviders
            ? t('Usage-based billing · price not configured')
            : t('Dynamic Pricing')}
        </span>
      )
    }
  } else if (isUnconfiguredTaskUsage) {
    priceSummary = (
      <span className='text-muted-foreground col-span-full'>
        {t('Usage-based billing · price not configured')}
      </span>
    )
  } else if (isTokenBased) {
    const prices: { type: PriceType; label: string }[] = [
      { type: 'input', label: t('Input') },
      { type: 'output', label: t('Output') },
      ...(props.model.cache_ratio != null
        ? [{ type: 'cache' as const, label: t('Cached') }]
        : []),
    ]
    priceSummary = prices.map((price) => (
      <div key={price.type} className='flex min-w-0 flex-col gap-1'>
        <span className='text-muted-foreground text-xs'>{price.label}</span>
        <span className='font-mono text-sm font-semibold tabular-nums'>
          {formatPrice(
            props.model,
            price.type,
            tokenUnit,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
          <span className='text-muted-foreground text-xs font-normal'>
            {' '}
            / {tokenUnitLabel}
          </span>
        </span>
      </div>
    ))
  } else {
    priceSummary = (
      <div className='col-span-full flex min-w-0 flex-col gap-1'>
        <span className='font-mono text-sm font-semibold tabular-nums'>
          {formatRequestPrice(
            props.model,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
          <span className='text-muted-foreground text-xs font-normal'>
            {' '}
            / {t('request')}
          </span>
        </span>
      </div>
    )
  }

  return (
    <Card
      className='hover:ring-foreground/20 group relative flex h-full cursor-pointer flex-col gap-0 rounded-2xl border p-4 transition-all duration-200 hover:shadow-md'
      onClick={() => props.onClick(props.model.model_name || '')}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-1 items-start gap-3'>
          <div
            aria-hidden
            className='bg-muted/50 flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-xs'
          >
            {modelIcon || (
              <span className='text-muted-foreground text-base font-bold'>
                {initial}
              </span>
            )}
          </div>
          <div className='min-w-0 flex-1'>
            <h3
              className='truncate font-mono text-base font-bold text-foreground'
              title={props.model.model_name}
            >
              {props.model.model_name}
            </h3>
            {props.model.vendor_name && (
              <p
                className='text-muted-foreground/80 truncate text-xs'
                title={props.model.vendor_name}
              >
                {props.model.vendor_name}
              </p>
            )}
            <div
              role='group'
              aria-label={t('Pricing')}
              className='mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs'
            >
              <ModelBillingModeBadge model={props.model} appearance='caption' />
              {dynamicSummary?.providerCount && (
                <span className='text-muted-foreground text-xs break-words'>
                  {t('{{count}} providers', {
                    count: dynamicSummary.providerCount,
                  })}
                  {dynamicSummary.hasUnconfiguredProviders &&
                    ` · ${t('Not configured for some providers')}`}
                </span>
              )}
              {priceSummary}
            </div>
          </div>
        </div>

        <div
          className='flex shrink-0 items-center'
          onClick={(e) => e.stopPropagation()}
        >
          <CopyButton
            value={props.model.model_name}
            tooltip={t('Copy model name')}
            className='size-7'
            iconClassName='size-3.5'
          />
        </div>
      </div>

      <div className='my-3 flex-1 min-w-0'>
        <ModelPerfBadge perf={props.perf} />
      </div>

      <div className='mt-auto flex items-center justify-between border-t border-border/50 pt-2.5 text-xs'>
        <div className='flex items-center gap-1.5'>
          {props.model.vendor_name && (
            <span className='text-muted-foreground/80 truncate text-xs'>
              {props.model.vendor_name}
            </span>
          )}
        </div>

        <div className='flex items-center gap-1'>
          {tags.length > 0 && (
            <div
              role='group'
              aria-label={t('Tags')}
              className='text-muted-foreground flex min-w-0 items-baseline gap-1 text-[11px]'
            >
              <span className='truncate' title={tags.join(', ')}>
                {tags.slice(0, 2).join(', ')}
              </span>
              {tags.length > 2 && (
                <span className='shrink-0' title={tags.slice(2).join(', ')}>
                  +{tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
})
