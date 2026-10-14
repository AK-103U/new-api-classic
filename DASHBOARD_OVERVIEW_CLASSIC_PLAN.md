# Dashboard Overview Classic Regression Plan

## Goal

Restore the **page content structure and visual presentation** of `dac55f0fd`'s
`/console` page at the current `/dashboard/overview` route. The target is the
Classic `/console` page composition, not a global rollback of the newer
Dashboard feature.

Keep the existing React/TanStack UI stack and current APIs. Do not copy the old
Semi UI implementation, add Semi UI, or import the Classic global stylesheet.

## Reference and current-state findings

Classic `/console` is composed in this order:

1. Greeting header with search and refresh actions.
2. Four grouped statistics cards (account, usage, resource consumption, and
   performance; two values per group).
3. A chart panel, optionally sharing a 3:1 grid with API information. Its common
   chart tabs are consumption distribution, call trend, call-count distribution,
   and call ranking; administrator-only tabs show user ranking and user trend.
4. A lower information row for announcements, FAQ, and uptime, shown according
   to the current server configuration.

The current `/dashboard/overview` instead renders the setup guide, a three-item
summary/wallet-health panel, and a separate performance-health panel, followed
by API information, announcements, FAQ, and uptime. The current chart views are
separate Dashboard sections. This means a 1:1 content-structure regression
requires restoring the Classic section order and grouped-stat/chart placement,
not just adding CSS to the current cards.

## Scope

- Rebuild `/dashboard/overview`'s rendered composition to match the Classic
  `/console` structure and responsive 1:1 / 2 / 4-column layout.
- Reuse current dashboard data APIs, chart processing, translations, and
  current UI primitives. Keep server-controlled visibility of API information,
  announcements, FAQ, and uptime.
- Keep the Classic admin-only user-ranking/trend content available only to
  administrators.
- Keep the current `/dashboard/models` page and administrator UI intact, but
  make the section administrator-only: hide it from regular users' dashboard
  navigation and redirect direct regular-user access to `/403`.

## Non-goals

- Do not change backend endpoints, request/response contracts, quota
  calculations, authentication/session handling, or server configuration.
- Do not redesign `/dashboard/models` or `/dashboard/flow`; this access change
  does not alter either section's content or APIs.
- Do not change `/dashboard/users`, admin dashboard settings, or public home
  pages.
- Do not implement other `目标.txt` items (usage-record content page,
  notification overlay, or user-facing IP-record policy).
- Do not modify shared/global UI styles in a way that leaks into other routes.

## Implementation approach

1. Use the legacy `/console` page and its dashboard components as the source of
   truth for layout, module order, columns, spacing, and controls.
2. Build the Overview composition from current primitives and current dashboard
   feature modules. Reuse current data contracts and preserve current
   configuration-driven visibility; avoid importing Classic components or
   Semi UI.
3. Restore grouped statistics and the single chart-panel composition in
   Overview, using the current quota/chart data pipeline. Retain existing chart
   and range/filter behavior where it is already supported; do not add server
   APIs.
4. Remove new-only setup-guide and performance-health blocks from the Overview
   page composition because they are absent from the requested 1:1 Classic
   content structure. Do not remove unrelated dashboard modules or the
   administrator `/dashboard/models` UI.
5. Mark Models administrator-only in the section registry and use that policy
   for both dashboard navigation and direct-route authorization. Preserve the
   existing administrator experience and redirect unauthorized access to
   `/403`.
6. Add tests for Overview composition, admin-only user charts, Models
   navigation visibility, and direct-route access; verify desktop/mobile,
   light/dark, loading/empty/config-disabled states.

## Verification

- Run affected Dashboard tests, `bun run typecheck`, lint for changed files,
  formatting checks, and `bun run build`.
- Browser-check `/dashboard/overview` against the Classic section order at
  desktop and narrow widths, in light and dark themes.
- Confirm API traffic, chart filters, server-configured panels, and
  administrator-only user charts retain their intended current data behavior.
- Confirm regular users do not see Models and are redirected to `/403` on a
  direct route; confirm administrators retain the Models route and UI.

## Execution status

- Implemented the Classic Overview order with current data APIs, responsive
  grouped stat cards, one chart panel, and config-driven information panels.
- Added composition and access tests for regular/admin chart tabs, Models
  navigation, regular/admin sidebar visibility, and direct-route redirects.
  Dashboard tests (50), typecheck, targeted lint/format checks, and production
  build pass.
- Browser inspection of `/dashboard/overview` redirected to sign-in; no test
  account was available, so authenticated visual checks at desktop/mobile and
  light/dark remain pending. The repository-wide format check also reports
  pre-existing issues in unrelated files; changed files pass targeted format.
- Models is now administrator-only in both section navigation and the global
  sidebar. Direct access to Models (and the already-admin-only Users section) is
  guarded with `/403`; route, sidebar metadata, and role-specific navigation
  tests pass.
