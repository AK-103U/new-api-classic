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

import { createSectionRegistry } from '@/features/system-settings/utils/section-registry'
import { ROLE } from '@/lib/roles'

/**
 * Dashboard page section definitions
 */
const DASHBOARD_SECTIONS = [
  {
    id: 'overview',
    titleKey: 'Overview',
    build: () => null,
  },
  {
    id: 'models',
    titleKey: 'Model Call Analytics',
    adminOnly: true,
    build: () => null,
  },
  {
    id: 'flow',
    titleKey: 'Flow',
    build: () => null,
  },
  {
    id: 'users',
    titleKey: 'User Analytics',
    adminOnly: true,
    build: () => null,
  },
] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]['id']

const ADMIN_ONLY_SECTIONS = new Set<string>(
  DASHBOARD_SECTIONS.filter(
    (section) => 'adminOnly' in section && section.adminOnly
  ).map((section) => section.id)
)

export function canAccessDashboardSection(
  section: string,
  isAdmin = false
): boolean {
  return isAdmin || !ADMIN_ONLY_SECTIONS.has(section)
}

export function getDashboardSectionRequiredRole(
  section: string
): number | undefined {
  return ADMIN_ONLY_SECTIONS.has(section) ? ROLE.ADMIN : undefined
}

export function getVisibleDashboardSectionIds(
  isAdmin = false
): DashboardSectionId[] {
  return DASHBOARD_SECTION_IDS.filter((section) =>
    canAccessDashboardSection(section, isAdmin)
  )
}

const dashboardRegistry = createSectionRegistry<
  DashboardSectionId,
  Record<string, never>,
  []
>({
  sections: DASHBOARD_SECTIONS,
  defaultSection: 'overview',
  basePath: '/dashboard',
  urlStyle: 'path',
})

export const DASHBOARD_SECTION_IDS = dashboardRegistry.sectionIds
export const DASHBOARD_DEFAULT_SECTION = dashboardRegistry.defaultSection

export function getDashboardSectionNavItems(
  t: TFunction,
  options?: { isAdmin?: boolean }
) {
  return dashboardRegistry
    .getSectionNavItems(t)
    .filter((_, idx) =>
      canAccessDashboardSection(DASHBOARD_SECTIONS[idx].id, options?.isAdmin)
    )
}
