# `/auth` routing

By default, all `/auth/*` routes are handled by `hub-websocket`.
In particular it deals with the custom SSO endpoint strategy goes through its authentiation system.

There are only a few exceptions for these next.js pages. **DO NOT ADD ANY MORE**!

- `/auth/sign-in` and `/auth/sign-up`: user can sign in or up for cocalc via a form
- `/auth/try`: optionally, anonymous "sign in" to test cocalc
- `/auth/verify/*`: verification of email address
- `/auth/password-reset/*`: password reset

Regarding Hub's SSO endpoints, it blacklists the 5 routes from above as names for the SSO strategies.
Entering them is currently only possible directly via the database,
hence that check happens upon SSO strategy initialization.

## Backend

- Kucalc's proxy service has to know about these exceptions and handle them properly.
- cocalc-cloud's ingress route configuration file has to list them as well (shorter route names take precedence in the nginx ingress controller)
