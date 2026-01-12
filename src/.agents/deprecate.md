# Deprecating old Functionality for [CoCalc.ai](http://CoCalc.ai)

Goal: Complete remove all code and functionality for the following:

- [ ] payg project upgrades
- [ ] project licenses
- [ ] legacy upgrades \(from 2020 and earlier\)
- [ ] Sage worksheets
- [ ] payg LLM purchases
- [ ] all code involving compute\_servers
- [ ] public projects, i.e., most anything involving an is\_project flag in the frontend

## Remove **PAYG project upgrades** only \(leaving compute servers \+ LLM PAYG untouched for now\), with clear checkpoints:

1. **Disable the UI entry points \(no deletions yet\).**  
   Remove the project PAYG upgrade panel from project settings/flyouts and any “upgrade this project” entry points.  
   Touchpoints: [src/packages/frontend/project/settings/upgrade\-usage.tsx](./src/packages/frontend/project/settings/upgrade-usage.tsx), [src/packages/frontend/project/page/file\-tab.tsx](./src/packages/frontend/project/page/file-tab.tsx), [src/packages/frontend/project/page/flyouts/licenses.tsx](./src/packages/frontend/project/page/flyouts/licenses.tsx).  
   Review: UI no longer shows “Upgrade this project…” or “Clear upgrades” for PAYG.

2. **Remove frontend project‑PAYG modules.**  
   Delete the project PAYG quota editor and start/stop helpers, and disconnect Redux/actions.  
   Touchpoints: [src/packages/frontend/project/settings/quota\-editor/pay\-as\-you\-go.tsx](./src/packages/frontend/project/settings/quota-editor/pay-as-you-go.tsx), [src/packages/frontend/purchases/pay\-as\-you\-go/start\-project.ts](./src/packages/frontend/purchases/pay-as-you-go/start-project.ts), [src/packages/frontend/purchases/pay\-as\-you\-go/stop\-project.ts](./src/packages/frontend/purchases/pay-as-you-go/stop-project.ts), [src/packages/frontend/projects/actions.ts](./src/packages/frontend/projects/actions.ts).  
   Review: no project PAYG code remains in frontend modules.

3. **Remove backend project‑PAYG handling.**  
   Eliminate the server flow that creates “project\-upgrade” purchases and applies pay\_as\_you\_go quotas.  
   Touchpoints: [src/packages/server/projects/control/pay\-as\-you\-go.ts](./src/packages/server/projects/control/pay-as-you-go.ts), [src/packages/server/projects/control/base.ts](./src/packages/server/projects/control/base.ts), [src/packages/server/purchases/project\-quotas.ts](./src/packages/server/purchases/project-quotas.ts), [src/packages/server/purchases/set\-project\-quota.ts](./src/packages/server/purchases/set-project-quota.ts).  
   Review: project run quota no longer considers pay\_as\_you\_go.

4. **Remove project‑PAYG API endpoints.**  
   Delete endpoints and manifest entries used only by project PAYG upgrades.  
   Touchpoints: [src/packages/next/pages/api/v2/purchases/get\-max\-project\-quotas.ts](./src/packages/next/pages/api/v2/purchases/get-max-project-quotas.ts), [src/packages/next/pages/api/v2/purchases/get\-prices\-project\-quotas.ts](./src/packages/next/pages/api/v2/purchases/get-prices-project-quotas.ts), [src/packages/next/lib/api\-v2\-manifest.ts](./src/packages/next/lib/api-v2-manifest.ts).  
   Review: no frontend calls these endpoints.

5. **Schema \+ tests cleanup \(confirm scope\).**  
   Decide whether to keep `"project-upgrade"` purchase type for historical data or remove entirely.  ANSWER: remove entirely.  [Cocalc.ai](http://Cocalc.ai) will launch as a NEW SITE with no historical data.  
   If removing: update [src/packages/util/db\-schema/purchases.ts](./src/packages/util/db-schema/purchases.ts), [src/packages/util/db\-schema/purchase\-quotas.ts](./src/packages/util/db-schema/purchase-quotas.ts), and delete project‑upgrade test cases in [src/packages/server/purchases/get\-balance.test.ts](./src/packages/server/purchases/get-balance.test.ts), [src/packages/server/purchases/get\-spend\-rate.test.ts](./src/packages/server/purchases/get-spend-rate.test.ts), [src/packages/server/purchases/get\-service\-cost.test.ts](./src/packages/server/purchases/get-service-cost.test.ts), [src/packages/server/purchases/statements/create\-statements.test.ts](./src/packages/server/purchases/statements/create-statements.test.ts).  
   Review: build/test green, no references remain.

6. **Final sweep for copy \+ logs.**  
   Remove project‑PAYG references from history renderers and copy.  
   Touchpoints: [src/packages/frontend/project/history/log\-entry.tsx](./src/packages/frontend/project/history/log-entry.tsx), [src/packages/frontend/project/history/types.ts](./src/packages/frontend/project/history/types.ts), [src/packages/frontend/purchases/purchases.tsx](./src/packages/frontend/purchases/purchases.tsx).  
   Review: no “pay\-as\-you\-go project upgrade” copy remains.

Question before step 5: do you want to **keep rendering historical “project\-upgrade” purchases** in the purchases/history UI, or remove those rows entirely?  REMOVE.  
