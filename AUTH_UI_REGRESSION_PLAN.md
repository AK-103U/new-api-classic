# Authentication UI Visual Regression Plan

## Goal

Restore the visual appearance of the authentication pages to the Classic frontend as it existed at commit `dac55f0fd`, while retaining the current frontend implementation and behavior.

This is a presentation-only change. The current authentication flows remain the source of truth.

## Scope

Apply the Classic visual treatment to:

- Sign-in and sign-up
- Forgot-password and password-reset confirmation
- Login OTP / secure-verification dialog
- OAuth callback screens for login, account binding, and verification
- Auth-specific dialogs and overlays rendered through portals

Use `目标.txt` as the broader UI task list; this plan covers only its authentication-page portion.

## Explicit non-goals

Do not change:

- Authentication APIs, request/response contracts, validation, or error semantics
- Routes, redirects, session/cookie handling, auth state, or token handling
- Password, email verification, Turnstile, MFA/OTP, Passkey, OAuth/OIDC, or account-binding behavior
- Conditional visibility driven by server status, terms/privacy consent, or provider configuration
- Non-auth pages or global application appearance

Do not copy Classic authentication components or add the Classic frontend's Semi UI dependency.

## Maintenance strategy: presentation mapping

Keep the current React authentication components and handlers canonical. Add a small, isolated appearance adapter:

1. Mark the shared auth shell with a stable `data-auth-skin="classic"` hook.
2. Add only the minimum semantic `data-auth-part` hooks needed to map shell, brand, panel, title, form groups, and portal-rendered auth dialogs.
3. Keep Classic-specific design tokens and scoped selectors in an auth-only stylesheet. Do not import Classic's global stylesheet or target brittle chains of generated DOM/classes.
4. Reuse current shared primitives (Card, Button, Input, Dialog, etc.); use the mapping layer for appearance rather than replacing them.
5. Keep changes to authentication feature JSX structural/presentational only. Do not edit auth hooks, API functions, stores, route guards, or verification state machines.

Upstream security changes should therefore continue to apply to the current auth logic. If upstream changes a mapped semantic slot, only the mapping/slot needs a small update; this is not intended to eliminate all maintenance.

## Implementation steps

1. Use `dac55f0fd:web/classic` auth components and `web/classic/src/index.css` as the visual reference; translate the old centered brand/card, background glow, and control treatment to current primitives.
2. Implement the shared auth shell and scoped appearance mapping, including safe-area/scroll behavior for long forms and mobile viewports.
3. Apply page-specific visual adjustments to the current auth screens while preserving current fields, provider choices, consent, verification, and loading/error states.
4. Style portal-rendered OTP/security and auth dialogs with explicit auth-only markers; avoid changing shared Dialog behavior globally.
5. Verify light/dark and responsive states, and confirm server-configured auth options still render correctly.

## Implementation progress

- [x] Add a shared Classic-style auth shell and isolated `data-auth-skin="classic"` / `data-auth-part` presentation hooks.
- [x] Add `web/src/styles/auth-classic.css`, imported by the global stylesheet but scoped to the auth shell or explicitly marked auth portals.
- [x] Apply semantic page/intro hooks to sign-in, sign-up, forgot/reset, OTP, and OAuth callback screens; style portal-rendered auth dialogs without changing shared Dialog behavior.
- [x] Add a shell regression test and run the targeted auth verification suite.
- [x] Manually inspect sign-in, sign-up, forgot-password, and reset at desktop; sign-in at mobile; and sign-in in the dark theme.
- [ ] Finish manual inspection of OTP/security dialogs, OAuth callback, and server-configured auth option combinations.

## Verification

- Run affected auth component tests, `bun run typecheck`, and lint on changed frontend files.
- Check sign-in, sign-up, forgot/reset, OTP/security verification, OAuth callback, and auth dialogs at mobile and desktop widths in light and dark themes.
- Confirm there are no changes to auth API traffic or flow state as part of this visual task.

## Security boundary

OWASP Authentication and Session Management Cheat Sheets were reviewed before implementation. This work does not implement, alter, or claim to validate authentication/session security controls; it must preserve the existing controls and behavior unchanged.
