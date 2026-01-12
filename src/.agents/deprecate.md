# Deprecating old Functionality for [CoCalc.ai](http://CoCalc.ai)

Goal: Complete remove all code and functionality for the following:

- [x] payg project upgrades
- [ ] project licenses
- [ ] legacy upgrades \(from 2020 and earlier\)
- [ ] Sage worksheets: opening a sagews should convert it to ipynb automatically \(if ipynb doesn't exist already\), then open that. Nothing else.
- [ ] payg LLM purchases
- [ ] all code involving compute\_servers
- [ ] dedicated\_vms and dedicated\_disks
- [ ] public projects, i.e., most anything involving an is\_project flag in the frontend

## Remove **legacy upgrades (pre-2020 Stripe-based project upgrades)** with clear checkpoints:

1. **Delete legacy Stripe sync/maintenance paths.**  
   Remove periodic syncing and migration code that only exists for legacy upgrades.  
   Touchpoints: [src/packages/server/stripe/sync.ts](./src/packages/server/stripe/sync.ts), [src/packages/server/purchases/legacy/maintain-legacy-upgrades.ts](./src/packages/server/purchases/legacy/maintain-legacy-upgrades.ts), [src/packages/server/purchases/legacy/subscriptions.ts](./src/packages/server/purchases/legacy/subscriptions.ts), [src/packages/server/purchases/legacy/credit-cards.ts](./src/packages/server/purchases/legacy/credit-cards.ts), [src/packages/database/postgres/stripe/sync-customer.ts](./src/packages/database/postgres/stripe/sync-customer.ts), [src/packages/server/purchases/maintenance.ts](./src/packages/server/purchases/maintenance.ts).  
   Review: no legacy sync/migration tasks remain; no Stripe polling for legacy upgrades.

2. **Remove legacy upgrade entitlements from the Stripe client.**  
   Delete legacy upgrade subscription create/cancel handlers and “available upgrades” messaging.  
   Touchpoints: [src/packages/server/stripe/client.ts](./src/packages/server/stripe/client.ts), [src/packages/util/message.js](./src/packages/util/message.js), [src/packages/util/message.d.ts](./src/packages/util/message.d.ts).  
   Review: no “available\_upgrades” message path remains; no legacy plan creation from Stripe client.

3. **Remove upgrade entitlement computation and spec.**  
   Delete the old upgrade subscription spec and the entitlement math.  
   Touchpoints: [src/packages/util/upgrades.js](./src/packages/util/upgrades.js), [src/packages/util/upgrade-spec.ts](./src/packages/util/upgrade-spec.ts).  
   Review: no legacy subscription plans or entitlement math remain.

4. **Remove user-applied upgrades from project quota computation.**  
   Stop reading user upgrades in quota calculation and project start flow.  
   Touchpoints: [src/packages/util/upgrades/quota.ts](./src/packages/util/upgrades/quota.ts), [src/packages/server/projects/control/base.ts](./src/packages/server/projects/control/base.ts).  
   Review: project quotas are computed only from settings, membership defaults, and site licenses.

5. **Remove frontend upgrade application flows.**  
   Delete UI/actions that let users allocate upgrades to projects.  
   Touchpoints: [src/packages/frontend/components/upgrade-adjustor.tsx](./src/packages/frontend/components/upgrade-adjustor.tsx), [src/packages/frontend/project/settings/upgrade-usage.tsx](./src/packages/frontend/project/settings/upgrade-usage.tsx), [src/packages/frontend/projects/actions.ts](./src/packages/frontend/projects/actions.ts), [src/packages/frontend/account/store.ts](./src/packages/frontend/account/store.ts), [src/packages/frontend/course/project-upgrades.ts](./src/packages/frontend/course/project-upgrades.ts), [src/packages/frontend/course/store.ts](./src/packages/frontend/course/store.ts).  
   Review: no UI for applying per-project upgrades; no actions mutate `users.*.upgrades`.

6. **Schema + DB cleanup.**  
   Remove legacy upgrade fields/assumptions and any DB helpers that manage user upgrades.  
   Touchpoints: [src/packages/util/db-schema/projects.ts](./src/packages/util/db-schema/projects.ts), [src/packages/database/postgres-server-queries.coffee](./src/packages/database/postgres-server-queries.coffee), [src/packages/frontend/account/table.ts](./src/packages/frontend/account/table.ts), [src/packages/frontend/account/types.ts](./src/packages/frontend/account/types.ts).  
   Review: no schema/docs/code paths reference `stripe_customer` for legacy upgrades or `users.*.upgrades`.

7. **Tests + final sweep.**  
   Delete/adjust any tests and copy mentioning legacy upgrades.  
   Touchpoints: [src/packages/server/purchases/maintain-automatic-payments.test.ts](./src/packages/server/purchases/maintain-automatic-payments.test.ts), [src/packages/frontend/purchases/stripe-metered-subscription.tsx](./src/packages/frontend/purchases/stripe-metered-subscription.tsx), [src/packages/frontend/account/account-preferences-appearance.tsx](./src/packages/frontend/account/account-preferences-appearance.tsx), [src/packages/frontend/account/account-preferences-ai.tsx](./src/packages/frontend/account/account-preferences-ai.tsx), [src/packages/frontend/account/account-preferences-communication.tsx](./src/packages/frontend/account/account-preferences-communication.tsx).  
   Review: no legacy upgrade copy remains; builds/tests green.

There is NO EXPECTATION of backward compatibility or need to retain the ability to display old purchases. This is a clean break with the past.

