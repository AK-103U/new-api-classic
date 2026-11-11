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
import { Zap, ExternalLink, Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  getLatencyColorClass,
  openExternalSpeedTest,
} from '@/features/dashboard/lib/api-info'
import type { ApiInfoItem, PingStatus } from '@/features/dashboard/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getBgColorClass } from '@/lib/colors'
import { cn } from '@/lib/utils'

interface ApiInfoItemProps {
  item: ApiInfoItem
  status: PingStatus
  onTest: (url: string) => void
}

export function ApiInfoItemComponent(props: ApiInfoItemProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const item = props.item
  const status = props.status

  return (
    <div className='group hover:bg-muted/40 flex items-start gap-2.5 px-3 py-2.5 transition-colors sm:gap-3 sm:px-5 sm:py-3'>
      <span
        className={cn(
          'mt-1.5 inline-block size-2 shrink-0 rounded-full',
          getBgColorClass(item.color)
        )}
      />

      <div className='min-w-0 flex-1'>
        <div className='mb-1 flex w-full flex-wrap items-center justify-between gap-2'>
          <span className='text-foreground text-sm font-bold break-all'>
            {item.route}
          </span>

          <div className='flex shrink-0 items-center gap-1'>
            {status.testing && (
              <StatusBadge
                label={t('Testing...')}
                variant='warning'
                className='animate-pulse'
                copyable={false}
              />
            )}
            {status.latency !== null && !status.testing && (
              <StatusBadge
                variant='success'
                label={`${status.latency}${t('ms')}`}
                className={cn(
                  'font-mono font-medium',
                  getLatencyColorClass(status.latency)
                )}
                copyable={false}
              />
            )}
            {status.error && (
              <StatusBadge
                label={t('N/A')}
                variant='neutral'
                copyable={false}
              />
            )}

            <div className='flex items-center gap-0.5'>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => props.onTest(item.url)}
                disabled={status.testing}
                className='size-7 p-0'
                title={t('Test Latency')}
              >
                <Zap
                  className={cn('size-3.5', status.testing && 'animate-pulse')}
                />
              </Button>

              <Button
                variant='ghost'
                size='sm'
                onClick={() => openExternalSpeedTest(item.url)}
                className='size-7 p-0'
                title={t('External Speed Test')}
              >
                <Gauge className='size-3.5' />
              </Button>

              <Button
                variant='ghost'
                size='sm'
                className='size-7 p-0'
                title={t('Open in New Tab')}
                render={
                  <a
                    href={item.url}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                <ExternalLink className='size-3.5' />
              </Button>
            </div>
          </div>
        </div>

        <div className='mb-1 flex items-center gap-1'>
          <button
            type='button'
            onClick={() => void copyToClipboard(item.url)}
            className='text-primary cursor-pointer text-left font-mono text-xs break-all hover:underline'
          >
            {item.url}
          </button>
          <CopyButton
            value={item.url}
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-primary size-5 p-0'
            iconClassName='size-3.5'
            tooltip={t('Copy URL')}
            aria-label={t('Copy URL')}
          />
        </div>

        <div className='text-muted-foreground text-xs break-words'>
          {item.description}
        </div>
      </div>
    </div>
  )
}
