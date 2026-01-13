# Deprecating old Functionality for [CoCalc.ai](http://CoCalc.ai)

Goal: Complete remove all code and functionality for the following:

- [x] payg project upgrades
- [ ] project licenses
- [x] legacy upgrades \(from 2020 and earlier\)
- [ ] Sage worksheets: opening a sagews should convert it to ipynb automatically \(if ipynb doesn't exist already\), then open that. Nothing else.
- [ ] payg LLM purchases
- [ ] all code involving compute\_servers
- [ ] dedicated\_vms and dedicated\_disks
- [ ] GPU licenses
- [ ] public projects, i.e., most anything involving an is\_project flag in the frontend
- [ ] jitsi \-\- video chat

## Removed Dedicated Disk and VM's

1. **Inventory + scope confirmation (completed).**  
   Backend purchase/pricing: [src/packages/server/licenses/purchase/product-metadata.ts](./src/packages/server/licenses/purchase/product-metadata.ts), [src/packages/server/licenses/purchase/product-id.ts](./src/packages/server/licenses/purchase/product-id.ts), [src/packages/server/licenses/purchase/create-license.ts](./src/packages/server/licenses/purchase/create-license.ts), [src/packages/server/purchases/purchase-shopping-cart-item.ts](./src/packages/server/purchases/purchase-shopping-cart-item.ts), [src/packages/util/upgrades/dedicated.ts](./src/packages/util/upgrades/dedicated.ts), [src/packages/util/upgrades/shopping.ts](./src/packages/util/upgrades/shopping.ts), [src/packages/util/licenses/purchase/dedicated-price.ts](./src/packages/util/licenses/purchase/dedicated-price.ts).  
   Quota and validation: [src/packages/util/upgrades/quota.ts](./src/packages/util/upgrades/quota.ts), [src/packages/util/upgrades/utils.ts](./src/packages/util/upgrades/utils.ts).  
   Schema and DB: [src/packages/util/db-schema/site-licenses.ts](./src/packages/util/db-schema/site-licenses.ts), [src/packages/database/postgres/site-license/hook.ts](./src/packages/database/postgres/site-license/hook.ts), [src/packages/util/licenses/check-disk-name-uniqueness.ts](./src/packages/util/licenses/check-disk-name-uniqueness.ts).  
   Project runtime: [src/packages/project/project-setup.ts](./src/packages/project/project-setup.ts), [src/packages/project/dedicated-disks.ts](./src/packages/project/dedicated-disks.ts).  
   Frontend UI: [src/packages/frontend/site-licenses/site-license-public-info.tsx](./src/packages/frontend/site-licenses/site-license-public-info.tsx), [src/packages/frontend/site-licenses/purchase/quota-editor.tsx](./src/packages/frontend/site-licenses/purchase/quota-editor.tsx), [src/packages/frontend/purchases/purchases.tsx](./src/packages/frontend/purchases/purchases.tsx), [src/packages/frontend/projects/store.ts](./src/packages/frontend/projects/store.ts), [src/packages/frontend/project/settings/upgrade-usage.tsx](./src/packages/frontend/project/settings/upgrade-usage.tsx), [src/packages/next/components/store/util.ts](./src/packages/next/components/store/util.ts).  
   Types: [src/packages/util/types/dedicated.ts](./src/packages/util/types/dedicated.ts), [src/packages/util/types/site-licenses.ts](./src/packages/util/types/site-licenses.ts), [src/packages/util/licenses/purchase/types.ts](./src/packages/util/licenses/purchase/types.ts).  
   Tests: [src/packages/util/quota.test.ts](./src/packages/util/quota.test.ts), [src/packages/database/postgres/site-license/hook.test.ts](./src/packages/database/postgres/site-license/hook.test.ts), [src/packages/server/projects/control/stop-idle-projects.test.ts](./src/packages/server/projects/control/stop-idle-projects.test.ts), [src/packages/server/prices.test.ts](./src/packages/server/prices.test.ts).

2. **Backend removal.**  
   Remove dedicated VM/disk purchase, pricing, and license creation paths.  
   Delete dedicated selection logic in quota computation and site license hooks.  
   Review: no server endpoints or quota paths accept or emit dedicated_* fields.

3. **Schema + types cleanup.**  
   Remove dedicated_* from schema, DB helpers, and types.  
   Remove dedicated disk name uniqueness checks.  
   Review: schema no longer advertises dedicated_vm/dedicated_disk fields.

4. **Frontend cleanup.**  
   Remove dedicated VM/disk fields from site license quota editor and display components.  
   Remove purchases/store rendering of dedicated items and project upgrade usage display.  
   Review: no UI shows dedicated VM/disk options or descriptions.

5. **Tests + docs sweep.**  
   Delete dedicated VM/disk test cases and update any docs or copy that reference them.  
   Review: tests green; no dedicated_* references remain in copy.
