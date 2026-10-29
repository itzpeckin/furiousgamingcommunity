# Account and onboarding recovery

Delivered in 8.2.28. Recovery stays on the action where the problem occurred; form details remain available while the page is open. Passwords and email-action tokens are never persisted by the recovery UI or included in support messages.

| Situation | User's next action |
| --- | --- |
| Incorrect email/password | Check credentials, request a reset link, or use the existing Discord sign-in option. |
| Expired FHQ session | Sign in with the same account; beta/invited setup destination is retained. |
| Expired or used email link | Check Account Settings for verification; request a new reset link for password recovery. |
| Email connection opened under another account | Sign out from Your leagues if necessary, sign in to the original account, then reopen the email link. The token is not consumed. |
| Email requests limited | Check inbox/spam and wait up to an hour before requesting another. |
| Email delivery unavailable | Check inbox first, then try later if no email arrives; do not create another account. |
| Email verification required | Account Settings → Send verification email → confirm → check setup status again. |
| Invitation unusable | Verify the invited account, request a replacement invitation, or apply for beta access. |
| Reserved league URL | Check existing applications first; choose another URL for a different league. |
| Preparation interrupted or changed | Check application status and Continue setup on the saved league. |
| Application response lost | Check status before submitting again; no automatic mutation retry. |
| Application declined/cancelled | Contact the inviter before applying again. |
| Repeated generic request limits | Wait a few minutes; this is distinct from the email quota. |
| Account loading or network failure | Reload account/check application status; no indefinite loading screen. |

The client bounds each request at 25 seconds and prevents overlapping form actions. A timeout does not cancel a server operation; it is presented as an unknown outcome. The application API continues to reconcile the same user/slug to its existing plan. A request reference is displayed only when supplied in an accepted format.

Password-reset requests retain the same public response for known and unknown email addresses, including throttled deliveries. Tests exercise the real account handlers with an isolated database and simulated mail. Browser fault checks use the shipped pages/scripts at desktop and phone widths; they do not establish live inbox delivery.

Audit coverage: AC01–AC08 and AC10–AC14 for these account/onboarding surfaces. AC03 here covers access recovery only; commissioner authorization in other features remains in its own flow. Discord OAuth callback error pages (AC09), trades, league controls, and season-transition recovery remain separate follow-ups.
