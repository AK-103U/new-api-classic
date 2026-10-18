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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { useNotificationStore } from '@/stores/notification-store'

import { NoticeModal, NotificationButton } from '../notice-modal'

describe('NoticeModal component', () => {
  it('renders title, tabs, and notice content when open', () => {
    render(
      <NoticeModal
        open
        onOpenChange={vi.fn()}
        activeTab='notice'
        onTabChange={vi.fn()}
        notice='Welcome to the platform!'
        announcements={[]}
        loading={false}
      />
    )

    expect(
      screen.getByRole('heading', { name: /System Announcements/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Notice/i })).toBeInTheDocument()
    expect(screen.getByText('Welcome to the platform!')).toBeInTheDocument()
  })

  it('renders announcements timeline with shine-text on unread item', () => {
    const announcements = [
      {
        id: 1,
        content: 'New Model Released',
        type: 'info',
        publishDate: '2026-10-14T10:00:00Z',
      },
      {
        id: 2,
        content: 'Maintenance Notice',
        type: 'warning',
        publishDate: '2026-10-13T10:00:00Z',
      },
    ]

    render(
      <NoticeModal
        open
        onOpenChange={vi.fn()}
        activeTab='announcements'
        onTabChange={vi.fn()}
        notice=''
        announcements={announcements}
        loading={false}
        isAnnouncementRead={(item) => item.id === 2}
      />
    )

    const unreadItem = screen.getByText('New Model Released').closest('.shine-text')
    expect(unreadItem).toBeInTheDocument()

    const readItem = screen.getByText('Maintenance Notice').closest('.shine-text')
    expect(readItem).toBeNull()
  })

  it('calls onCloseToday and closes when Close Today is clicked', async () => {
    const handleCloseToday = vi.fn()
    const handleOpenChange = vi.fn()

    render(
      <NoticeModal
        open
        onOpenChange={handleOpenChange}
        activeTab='notice'
        onTabChange={vi.fn()}
        notice='Some notice'
        announcements={[]}
        loading={false}
        onCloseToday={handleCloseToday}
      />
    )

    const closeTodayBtn = screen.getByRole('button', { name: /Close Today/i })
    await userEvent.click(closeTodayBtn)

    expect(handleCloseToday).toHaveBeenCalledTimes(1)
    expect(handleOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onOpenChange(false) when Close button is clicked', async () => {
    const handleOpenChange = vi.fn()

    render(
      <NoticeModal
        open
        onOpenChange={handleOpenChange}
        activeTab='notice'
        onTabChange={vi.fn()}
        notice='Some notice'
        announcements={[]}
        loading={false}
      />
    )

    const closeBtn = screen.getByRole('button', { name: /Close Notice/i })
    await userEvent.click(closeBtn)

    expect(handleOpenChange).toHaveBeenCalledWith(false)
  })

  it('switches tabs when tab triggers are clicked', async () => {
    const handleTabChange = vi.fn()

    render(
      <NoticeModal
        open
        onOpenChange={vi.fn()}
        activeTab='notice'
        onTabChange={handleTabChange}
        notice='Some notice'
        announcements={[]}
        loading={false}
      />
    )

    const announcementsTab = screen.getByRole('tab', { name: /System Announcements/i })
    await userEvent.click(announcementsTab)

    expect(handleTabChange).toHaveBeenCalledWith('announcements')
  })
})

describe('NotificationButton component', () => {
  it('renders button without badge when unreadCount is 0', () => {
    render(<NotificationButton unreadCount={0} onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: /Notifications/i })
    expect(button).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('renders badge with count when unreadCount > 0', () => {
    render(<NotificationButton unreadCount={5} onClick={vi.fn()} />)

    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders 99+ when unreadCount > 99', () => {
    render(<NotificationButton unreadCount={150} onClick={vi.fn()} />)

    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('triggers onClick handler when clicked', async () => {
    const handleClick = vi.fn()
    render(<NotificationButton unreadCount={1} onClick={handleClick} />)

    const button = screen.getByRole('button', { name: /Notifications/i })
    await userEvent.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

describe('Notification store Close Today integration', () => {
  it('correctly tracks and persists isNoticeClosed for today', () => {
    const today = new Date().toDateString()
    const store = useNotificationStore.getState()

    // Reset store state
    store.setClosedUntilDate(null)
    expect(store.isNoticeClosed()).toBe(false)

    // Set closed for today
    store.setClosedUntilDate(today)
    expect(store.isNoticeClosed()).toBe(true)
    expect(localStorage.getItem('notice_close_date')).toBe(today)

    // Reset again
    store.setClosedUntilDate(null)
    expect(store.isNoticeClosed()).toBe(false)
  })

  it('detects legacy localStorage notice_close_date for backwards compatibility', () => {
    const today = new Date().toDateString()
    const store = useNotificationStore.getState()

    store.setClosedUntilDate(null)
    localStorage.setItem('notice_close_date', today)

    expect(store.isNoticeClosed()).toBe(true)

    localStorage.removeItem('notice_close_date')
    expect(store.isNoticeClosed()).toBe(false)
  })
})
