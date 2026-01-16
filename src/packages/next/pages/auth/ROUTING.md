# `/auth` routing

By default, all `/auth/*` routes are handled by `hub-websocket`.
In particular it deals with the custom SSO endpoint strategy goes through its authentication system.

There are only a few exceptions for these next.js pages. **DO NOT ADD ANY MORE**!

- `/auth/sign-in` and `/auth/sign-up`: user can sign in or up for cocalc via a form
- `/auth/verify/*`: verification of email address – but this is **not** working and not used. No idea what's the plan.
  - `/auth/verify?email=...&token=...` is handled by `hub-next`, but it's the old code in `./hub/auth.ts`, registered before `hub-next`'s routes.
- `/auth/password-reset/*`: password reset

Regarding Hub's SSO endpoints, it blacklists the 5 routes from above as names for the SSO strategies.
Entering them is currently only possible directly via the database,
hence that check happens upon SSO strategy initialization.

## Backend

- Kucalc's proxy service redirects all `/auth` routes to `hub-next`, but since this is still setting up all the auth routes, everything should be fine.
- cocalc-onprem's ingress route configuration file has to list them as well (shorter route names take precedence in the nginx ingress controller)
