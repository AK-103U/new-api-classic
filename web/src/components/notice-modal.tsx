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
import type { TFunction } from 'i18next'
import { Bell, Megaphone } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { RichContent } from '@/components/rich-content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'

export interface AnnouncementItem {
  id?: number | string
  type?: string
  content?: string
  extra?: string
  publishDate?: string | Date
  [key: string]: unknown
}

export interface NoticeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeTab: 'notice' | 'announcements'
  onTabChange: (tab: 'notice' | 'announcements') => void
  notice: string
  announcements: AnnouncementItem[]
  loading: boolean
  isAnnouncementRead?: (item: AnnouncementItem) => boolean
  onCloseToday?: () => void
  className?: string
}

function getRelativeTime(publishDate: string | Date, t: TFunction): string {
  if (!publishDate) return ''

  const now = new Date()
  const pubDate = new Date(publishDate)

  if (Number.isNaN(pubDate.getTime())) {
    return typeof publishDate === 'string' ? publishDate : ''
  }

  const diffMs = now.getTime() - pubDate.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffMs < 0) return formatDateTimeObject(pubDate)

  if (diffSeconds < 60) return t('Just now')
  if (diffMinutes < 60) {
    return diffMinutes === 1
      ? t('1 minute ago')
      : t('{{count}} minutes ago', { count: diffMinutes })
  }
  if (diffHours < 24) {
    return diffHours === 1
      ? t('1 hour ago')
      : t('{{count}} hours ago', { count: diffHours })
  }
  if (diffDays < 7) {
    return diffDays === 1
      ? t('1 day ago')
      : t('{{count}} days ago', { count: diffDays })
  }
  if (diffWeeks < 4) {
    return diffWeeks === 1
      ? t('1 week ago')
      : t('{{count}} weeks ago', { count: diffWeeks })
  }
  if (diffMonths < 12) {
    return diffMonths === 1
      ? t('1 month ago')
      : t('{{count}} months ago', { count: diffMonths })
  }
  if (diffYears < 2) return t('1 year ago')

  return formatDateTimeObject(pubDate)
}

function AnnouncementDot({ type }: { type?: string }) {
  return (
    <span
      className={cn(
        'mt-1.5 inline-block size-2 shrink-0 rounded-full ring-2 ring-background',
        getAnnouncementColorClass(type)
      )}
    />
  )
}

function getAnnouncementRenderKey(announcement: AnnouncementItem): string {
  if (announcement.id !== undefined && announcement.id !== null) {
    return `id:${announcement.id}`
  }

  return JSON.stringify({
    content: announcement.content ?? '',
    extra: announcement.extra ?? '',
    publishDate: announcement.publishDate ?? '',
    type: announcement.type ?? '',
  })
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description?: string
}) {
  return (
    <Empty className='border-0 p-0'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>{icon}</EmptyMedia>
        <EmptyTitle className='text-base font-medium'>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  )
}

function NoticePaneContent({
  loading,
  notice,
  t,
}: {
  loading: boolean
  notice: string
  t: TFunction
}) {
  if (loading) {
    return (
      <div className='flex h-full items-center justify-center py-6'>
        <EmptyState
          icon={<Bell className='size-8 text-muted-foreground' />}
          title={t('Loading...')}
          description={t('Latest platform updates and notices')}
        />
      </div>
    )
  }

  if (!notice) {
    return (
      <div className='flex h-full items-center justify-center py-6'>
        <EmptyState
          icon={<Bell className='size-8 text-muted-foreground' />}
          title={t('No announcements at this time')}
        />
      </div>
    )
  }

  return (
    <div className='h-full overflow-y-auto overflow-x-hidden pr-2 text-sm leading-relaxed [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:text-base'>
      <RichContent breaks content={notice} />
    </div>
  )
}

function AnnouncementsPaneContent({
  loading,
  announcements,
  isAnnouncementRead,
  t,
}: {
  loading: boolean
  announcements: AnnouncementItem[]
  isAnnouncementRead?: (item: AnnouncementItem) => boolean
  t: TFunction
}) {
  if (loading) {
    return (
      <div className='flex h-full items-center justify-center py-6'>
        <EmptyState
          icon={<Megaphone className='size-8 text-muted-foreground' />}
          title={t('Loading...')}
          description={t('Latest platform updates and notices')}
        />
      </div>
    )
  }

  if (announcements.length === 0) {
    return (
      <div className='flex h-full items-center justify-center py-6'>
        <EmptyState
          icon={<Megaphone className='size-8 text-muted-foreground' />}
          title={t('No system announcements')}
        />
      </div>
    )
  }

  return (
    <div className='h-full overflow-y-auto overflow-x-hidden pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
      <div className='flex flex-col'>
        {announcements.map((item, idx) => {
          const announcementKey = getAnnouncementRenderKey(item)
          const isUnread = isAnnouncementRead
            ? !isAnnouncementRead(item)
            : false
          const publishDate = item.publishDate
            ? new Date(item.publishDate)
            : null
          const relativeTime = publishDate
            ? getRelativeTime(publishDate, t)
            : ''
          const absoluteTime = publishDate
            ? formatDateTimeObject(publishDate)
            : ''

          return (
            <div key={announcementKey}>
              <div className='py-3'>
                <div className='flex items-start gap-3'>
                  <AnnouncementDot type={item.type} />
                  <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                    <div
                      className={cn(
                        'text-sm leading-relaxed',
                        isUnread && 'shine-text font-medium'
                      )}
                    >
                      <RichContent
                        breaks
                        content={item.content || ''}
                      />
                    </div>

                    {item.extra ? (
                      <div className='text-muted-foreground text-xs'>
                        <RichContent breaks content={item.extra} />
                      </div>
                    ) : null}

                    {absoluteTime ? (
                      <div className='text-muted-foreground text-xs'>
                        {relativeTime ? `${relativeTime} • ` : null}
                        {absoluteTime}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              {idx < announcements.length - 1 ? (
                <Separator />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function NoticeModal({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  notice,
  announcements,
  loading,
  isAnnouncementRead,
  onCloseToday,
  className,
}: NoticeModalProps) {
  const { t } = useTranslation()

  const handleCloseToday = React.useCallback(() => {
    onCloseToday?.()
    onOpenChange(false)
  }, [onCloseToday, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'overflow-hidden flex w-[calc(100vw-2rem)] sm:w-[920px] sm:max-w-[920px] sm:h-[456px] sm:top-[80px] sm:translate-y-0 max-h-[90vh] flex-col gap-0 p-0',
          className
        )}
      >
        <Tabs
          value={activeTab}
          onValueChange={(val) => onTabChange(val as 'notice' | 'announcements')}
          className='flex h-full min-h-0 flex-1 flex-col'
        >
          <DialogHeader className='flex-shrink-0 border-b px-6 py-4'>
            <div className='flex items-center justify-between gap-3 pr-7'>
              <DialogTitle className='text-lg font-semibold sm:text-xl'>
                {t('System Announcements')}
              </DialogTitle>
              <TabsList className='h-9 p-1'>
                <TabsTrigger
                  value='notice'
                  className='gap-1.5 px-3 py-1.5 text-xs sm:text-sm data-active:shadow-xs'
                >
                  <Bell className='size-3.5 sm:size-4' />
                  {t('Notice')}
                </TabsTrigger>
                <TabsTrigger
                  value='announcements'
                  className='gap-1.5 px-3 py-1.5 text-xs sm:text-sm data-active:shadow-xs'
                >
                  <Megaphone className='size-3.5 sm:size-4' />
                  {t('System Announcements')}
                </TabsTrigger>
              </TabsList>
            </div>
          </DialogHeader>

          <div className='min-h-0 flex-1 overflow-hidden px-6 py-5'>
            <TabsContent value='notice' className='mt-0 h-full min-h-0 focus-visible:outline-hidden'>
              <NoticePaneContent loading={loading} notice={notice} t={t} />
            </TabsContent>

            <TabsContent
              value='announcements'
              className='mt-0 h-full min-h-0 focus-visible:outline-hidden'
            >
              <AnnouncementsPaneContent
                loading={loading}
                announcements={announcements}
                isAnnouncementRead={isAnnouncementRead}
                t={t}
              />
            </TabsContent>
          </div>

          <DialogFooter className='flex-shrink-0 flex flex-row justify-end gap-3 border-t px-6 py-4 sm:gap-3'>
            <Button
              variant='outline'
              onClick={handleCloseToday}
            >
              {t('Close Today')}
            </Button>
            <Button
              variant='default'
              onClick={() => onOpenChange(false)}
            >
              {t('Close Notice')}
            </Button>
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Trigger button for NoticeModal with unread badge count
 */
export function NotificationButton({
  unreadCount,
  onClick,
  className,
}: {
  unreadCount: number
  onClick: () => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <Button
      variant='ghost'
      size='icon'
      className={cn('relative size-9', className)}
      aria-label={t('Notifications')}
      onClick={onClick}
    >
      <Bell className='size-[1.2rem]' />
      {unreadCount > 0 ? (
        <Badge
          variant='destructive'
          className='absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center px-1 text-[10px] font-semibold tabular-nums'
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      ) : null}
    </Button>
  )
}
