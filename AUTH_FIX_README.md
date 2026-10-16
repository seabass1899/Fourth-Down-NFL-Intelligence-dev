# FourthDown P0.2 authentication hotfix

## Root cause and limitations
- Supabase `email rate limit exceeded` is enforced by Supabase, not the FourthDown UI. This patch does **not** bypass or reset the limit.
- Expired or previously consumed email links may show `otp_expired`; check the user's confirmation state in Supabase before sending another.

## Changes
- Email signup explicitly sets `emailRedirectTo` to the current browser origin (`http://localhost:3001` during local testing).
- User-facing feedback explains rate limits and expired links.
- Authentication requests reset their busy state even on unexpected failures.

## Apply safely
1. Stop the P0.2 Next.js server.
2. Back up your working `app/page.tsx`.
3. Copy this package's `app/page.tsx` over your P0.2 application's `app/page.tsx` (or use the complete patched package in a new folder).
4. In Supabase Authentication > URL Configuration: set Site URL `http://localhost:3001` and include `http://localhost:3001/**` in Redirect URLs.
5. Restart `npm run dev -- -p 3001`.
6. Open Supabase Authentication > Users and inspect whether the account is already registered and email-confirmed. If confirmed, sign in; if unconfirmed, wait for rate limiting to clear and request a single fresh verification email.

## Security
Never share credentials, service role keys, or verification links. Do not disable email confirmation in a subscriber production deployment.

## Validation caveat
Only source-level checks were completed for this hotfix. Supabase hosted email delivery and end-to-end browser confirmation were not tested.
