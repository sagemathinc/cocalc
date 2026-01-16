# Deprecating old Functionality for [CoCalc.ai](http://CoCalc.ai)

Goal: Complete remove all code and functionality for the following:

- [ ] public jupyter api
- [ ] Sage worksheets: opening a sagews should convert it to ipynb automatically \(if ipynb doesn't exist already\), then open that. Nothing else.
- [ ] payg LLM purchases
- [ ] all code involving compute\_servers and cloud filesystems
- [x] anonymous accounts / sign up
- [ ] public projects, i.e., most anything involving an is\_project flag in the frontend
- [ ] all dynamic user\-specific content from the nextjs app: the store, the new items \(?\).
- [x] public sandbox projects
- [x] vector database support code \-\- qdrant, "DEPRECATED - OpenAI Neural Search UI"
- [x] jitsi \-\- video chat
- [x] GPU licenses
- [x] copy\_paths 
- [x] limit_free_project_uptime with the countdown timer (any other "freemium dials?")
- [x] project licenses
- [x] payg project upgrades
- [x] legacy upgrades \(from 2020 and earlier\)
- [x] dedicated\_vms and dedicated\_disks
- [x] rename: "Project" \-\-&gt; "Workspace" in frontend UI

## \(done\) Remove Anonymous Accounts \(no email/passport auth\)

Scope: remove anonymous accounts and signup. Public share viewing stays. SSO/LTI accounts are fine (not anonymous).

1. **Remove /auth/try route and entry points.**  
   Delete the page and remove all links to it from landing/auth flows and routing docs.  
   Targets: [src/packages/next/pages/auth/try.tsx](./src/packages/next/pages/auth/try.tsx), [src/packages/next/components/landing/header.tsx](./src/packages/next/components/landing/header.tsx), [src/packages/next/components/landing/sign-in.tsx](./src/packages/next/components/landing/sign-in.tsx), [src/packages/next/components/auth/sign-in.tsx](./src/packages/next/components/auth/sign-in.tsx), [src/packages/next/components/auth/sign-up.tsx](./src/packages/next/components/auth/sign-up.tsx), [src/packages/next/components/auth/password-reset.tsx](./src/packages/next/components/auth/password-reset.tsx), [src/packages/next/components/auth/redeem-password-reset.tsx](./src/packages/next/components/auth/redeem-password-reset.tsx), [src/packages/next/pages/auth/ROUTING.md](./src/packages/next/pages/auth/ROUTING.md), [src/packages/next/lib/with-customize.ts](./src/packages/next/lib/with-customize.ts).

2. **Remove anonymous signup settings and customize wiring.**  
   Drop `anonymous_signup` and `anonymous_signup_licensed_shares` from site defaults and customize payloads.  
   Targets: [src/packages/util/db-schema/site-defaults.ts](./src/packages/util/db-schema/site-defaults.ts), [src/packages/util/db-schema/server-settings.ts](./src/packages/util/db-schema/server-settings.ts), [src/packages/database/settings/customize.ts](./src/packages/database/settings/customize.ts), [src/packages/frontend/customize.tsx](./src/packages/frontend/customize.tsx), [src/packages/lite/hub/settings.ts](./src/packages/lite/hub/settings.ts), [src/packages/project-host/web.ts](./src/packages/project-host/web.ts).

3. **Require authenticated account creation.**  
   Remove anonymous branch in signup API; add server-side guard to reject account creation without email or passport.  
   Targets: [src/packages/next/pages/api/v2/auth/sign-up.ts](./src/packages/next/pages/api/v2/auth/sign-up.ts), [src/packages/server/accounts/create-account.ts](./src/packages/server/accounts/create-account.ts).

4. **Remove anonymous share/edit flows.**  
   Delete “open anonymously” UI and anonymous edit URL handling.  
   Targets: [src/packages/next/components/share/edit/open-anonymously.tsx](./src/packages/next/components/share/edit/open-anonymously.tsx), [src/packages/next/components/share/edit/edit-options.tsx](./src/packages/next/components/share/edit/edit-options.tsx), [src/packages/next/lib/share/edit-url.ts](./src/packages/next/lib/share/edit-url.ts), [src/packages/next/components/app/path.tsx](./src/packages/next/components/app/path.tsx).

5. **Remove `is_anonymous` from profile payloads.**  
   Drop from private profile, share account info, and API schemas/OpenAPI.  
   Targets: [src/packages/server/accounts/profile/private.ts](./src/packages/server/accounts/profile/private.ts), [src/packages/server/accounts/profile/types.ts](./src/packages/server/accounts/profile/types.ts), [src/packages/next/lib/share/get-account-info.ts](./src/packages/next/lib/share/get-account-info.ts), [src/packages/next/lib/api/schema/accounts/profile.ts](./src/packages/next/lib/api/schema/accounts/profile.ts), [src/packages/next/public/openapi.json](./src/packages/next/public/openapi.json).

6. **Remove anonymous UI branches (frontend + next).**  
   Delete `is_anonymous` logic and related warnings, gating, and special pages.  
   Targets: [src/packages/frontend/account](./src/packages/frontend/account), [src/packages/frontend/project/anonymous-name.tsx](./src/packages/frontend/project/anonymous-name.tsx), [src/packages/frontend/project/page/activity-bar-tabs.tsx](./src/packages/frontend/project/page/activity-bar-tabs.tsx), [src/packages/frontend/projects/create-project.tsx](./src/packages/frontend/projects/create-project.tsx), [src/packages/frontend/app/page.tsx](./src/packages/frontend/app/page.tsx), [src/packages/next/components/account/config/layout.tsx](./src/packages/next/components/account/config/layout.tsx), [src/packages/next/components/account/config/anonymous](./src/packages/next/components/account/config/anonymous), [src/packages/next/components/account/navtab.tsx](./src/packages/next/components/account/navtab.tsx), [src/packages/next/components/store/index.tsx](./src/packages/next/components/store/index.tsx), [src/packages/next/components/billing/layout.tsx](./src/packages/next/components/billing/layout.tsx), [src/packages/next/components/misc/anonymous.tsx](./src/packages/next/components/misc/anonymous.tsx).

7. **I18n cleanup.**  
   Remove anonymous-only copy and translation variants in extracted/compiled strings.  
   Targets: [src/packages/frontend/i18n](./src/packages/frontend/i18n), [src/packages/frontend/account/settings/account-settings.tsx](./src/packages/frontend/account/settings/account-settings.tsx), [src/packages/frontend/account/sign-out.tsx](./src/packages/frontend/account/sign-out.tsx).

8. **Final sweep + validation.**  
   Ripgrep for `anonymous_signup` and `is_anonymous` in src/docs; run pnpm tsc --build.

## \(done\) Remove Public Jupyter API \(stateless execution\)

Scope: remove stateless Jupyter API used for public share demos and unauthenticated code execution. Keep project Jupyter kernels intact.

1. **Inventory touchpoints.**  
   Settings/customize: [src/packages/util/db-schema/site-defaults.ts](./src/packages/util/db-schema/site-defaults.ts), [src/packages/util/db-schema/site-settings-extras.ts](./src/packages/util/db-schema/site-settings-extras.ts), [src/packages/util/db-schema/server-settings.ts](./src/packages/util/db-schema/server-settings.ts), [src/packages/lite/hub/settings.ts](./src/packages/lite/hub/settings.ts), [src/packages/database/settings/customize.ts](./src/packages/database/settings/customize.ts), [src/packages/frontend/customize.tsx](./src/packages/frontend/customize.tsx), [src/packages/next/lib/customize.ts](./src/packages/next/lib/customize.ts).  
   Public paths + share: [src/packages/util/db-schema/public-paths.ts](./src/packages/util/db-schema/public-paths.ts), [src/packages/frontend/share/config.tsx](./src/packages/frontend/share/config.tsx), [src/packages/frontend/project_actions.ts](./src/packages/frontend/project_actions.ts), [src/packages/next/lib/share/get-public-path-info.ts](./src/packages/next/lib/share/get-public-path-info.ts), [src/packages/next/components/share/path-contents.tsx](./src/packages/next/components/share/path-contents.tsx), [src/packages/next/components/share/file-contents.tsx](./src/packages/next/components/share/file-contents.tsx), [src/packages/next/components/path/path.tsx](./src/packages/next/components/path/path.tsx), [src/packages/frontend/frame-editors/crm-editor/tables/public-paths.ts](./src/packages/frontend/frame-editors/crm-editor/tables/public-paths.ts).  
   Frontend usage: [src/packages/frontend/jupyter/browser-actions.ts](./src/packages/frontend/jupyter/browser-actions.ts), [src/packages/frontend/jupyter/nbviewer/cell-input.tsx](./src/packages/frontend/jupyter/nbviewer/cell-input.tsx), [src/packages/frontend/editors/slate/elements/code-block/index.tsx](./src/packages/frontend/editors/slate/elements/code-block/index.tsx), [src/packages/frontend/components/run-button/index.tsx](./src/packages/frontend/components/run-button/index.tsx), [src/packages/frontend/project/page/content.tsx](./src/packages/frontend/project/page/content.tsx), [src/packages/frontend/messages/index.tsx](./src/packages/frontend/messages/index.tsx), [src/packages/frontend/lib/file-context.ts](./src/packages/frontend/lib/file-context.ts), [src/packages/jupyter/redux/actions.ts](./src/packages/jupyter/redux/actions.ts).  
   Next/marketing UI: [src/packages/next/components/landing/header.tsx](./src/packages/next/components/landing/header.tsx), [src/packages/next/components/landing/cocalc-com-features.tsx](./src/packages/next/components/landing/cocalc-com-features.tsx), [src/packages/next/components/demo-cell.tsx](./src/packages/next/components/demo-cell.tsx), [src/packages/next/components/openai/chatgpt-help.tsx](./src/packages/next/components/openai/chatgpt-help.tsx).  
   Backend Jupyter API: [src/packages/server/jupyter/execute.ts](./src/packages/server/jupyter/execute.ts), [src/packages/server/jupyter/kernels.ts](./src/packages/server/jupyter/kernels.ts).

2. **Remove settings/customize flags.**  
   Drop `jupyter_api_enabled` and `jupyterApiEnabled` from schema and customize payloads; remove any admin UI toggles tied to it.

3. **Remove public path `jupyter_api` flag.**  
   Delete the field from public-path schema and remove share UI toggle, API payloads, and CRM table references.

4. **Remove stateless Jupyter API backend.**  
   Delete server handlers and any API routes that expose stateless execution or kernel listing.

5. **Remove UI surfaces that depend on Jupyter API.**  
   Remove demo cell and public share run buttons that require the Jupyter API; simplify file context plumbing.

6. **Final sweep + validation.**  
   Ripgrep for `jupyter_api` and `jupyterApiEnabled` across src and docs; run pnpm tsc --build.

## Remove Compute Servers + Cloud Filesystems

Scope: remove all compute server and cloud filesystem functionality. No migration needed (clean break). Project hosts remain the only replacement. Delete all documentation/marketing/policy references.

1. **Inventory touchpoints.**  
   Schema + settings: [src/packages/util/db-schema/compute-servers.ts](./src/packages/util/db-schema/compute-servers.ts), [src/packages/util/db-schema/cloud-filesystems.ts](./src/packages/util/db-schema/cloud-filesystems.ts), [src/packages/util/db-schema/site-defaults.ts](./src/packages/util/db-schema/site-defaults.ts), [src/packages/util/db-schema/site-settings-extras.ts](./src/packages/util/db-schema/site-settings-extras.ts), [src/packages/util/db-schema/purchases.ts](./src/packages/util/db-schema/purchases.ts), [src/packages/util/db-schema/purchase-quotas.ts](./src/packages/util/db-schema/purchase-quotas.ts), [src/packages/util/db-schema/index.ts](./src/packages/util/db-schema/index.ts).  
   Server services: [src/packages/server/compute](./src/packages/server/compute), [src/packages/server/compute/cloud-filesystem](./src/packages/server/compute/cloud-filesystem), [src/packages/server/compute/maintenance](./src/packages/server/compute/maintenance), [src/packages/server/compute/check-in.ts](./src/packages/server/compute/check-in.ts), [src/packages/server/compute/control.ts](./src/packages/server/compute/control.ts).  
   API routes + clients: [src/packages/next/pages/api/v2/compute](./src/packages/next/pages/api/v2/compute), [src/packages/next/pages/api/v2/internal/compute](./src/packages/next/pages/api/v2/internal/compute), [src/packages/conat/hub/api/compute.ts](./src/packages/conat/hub/api/compute.ts), [src/packages/frontend/compute](./src/packages/frontend/compute).  
   Frontend UI: [src/packages/frontend/project/servers](./src/packages/frontend/project/servers), [src/packages/frontend/project/page/flyouts](./src/packages/frontend/project/page/flyouts), [src/packages/frontend/account/account-page.tsx](./src/packages/frontend/account/account-page.tsx), [src/packages/frontend/frame-editors](./src/packages/frontend/frame-editors).  
   Marketing/docs/policies: [src/packages/next/pages/features/compute-server.tsx](./src/packages/next/pages/features/compute-server.tsx), [src/packages/next/pages/features/index.tsx](./src/packages/next/pages/features/index.tsx), [src/packages/next/pages/pricing/products.tsx](./src/packages/next/pages/pricing/products.tsx), [src/packages/next/pages/policies](./src/packages/next/pages/policies).

2. **Remove frontend compute server + cloud filesystem UI.**  
   Delete tabs, selectors, panels, and CRM tables for compute servers/cloud filesystems.  
   Targets: [src/packages/frontend/compute](./src/packages/frontend/compute), [src/packages/frontend/project/servers/project-servers.tsx](./src/packages/frontend/project/servers/project-servers.tsx), [src/packages/frontend/project/page/flyouts/servers.tsx](./src/packages/frontend/project/page/flyouts/servers.tsx), [src/packages/frontend/account/account-page.tsx](./src/packages/frontend/account/account-page.tsx), [src/packages/frontend/frame-editors/crm-editor/tables](./src/packages/frontend/frame-editors/crm-editor/tables).

3. **Remove marketing/docs/policies references.**  
   Delete compute-server feature pages, pricing entries, language page sections, and policy mentions.  
   Targets: [src/packages/next/pages/features/compute-server.tsx](./src/packages/next/pages/features/compute-server.tsx), [src/packages/next/pages/features/index.tsx](./src/packages/next/pages/features/index.tsx), [src/packages/next/pages/pricing/products.tsx](./src/packages/next/pages/pricing/products.tsx), [src/packages/next/pages/lang](./src/packages/next/pages/lang), [src/packages/next/pages/policies](./src/packages/next/pages/policies).

4. **Remove API routes + client plumbing.**  
   Delete compute/cloud-filesystem API endpoints and internal metrics endpoints; remove frontend API helpers.  
   Targets: [src/packages/next/pages/api/v2/compute](./src/packages/next/pages/api/v2/compute), [src/packages/next/pages/api/v2/internal/compute](./src/packages/next/pages/api/v2/internal/compute), [src/packages/frontend/compute/cloud-filesystem/api.ts](./src/packages/frontend/compute/cloud-filesystem/api.ts), [src/packages/conat/hub/api/compute.ts](./src/packages/conat/hub/api/compute.ts).  
   Remove `compute_server_id` propagation through client calls (exec/search/editors) using targeted rg results in [src/packages/frontend](./src/packages/frontend) and [src/packages/next](./src/packages/next).

5. **Remove server compute + cloud filesystem services.**  
   Delete compute server provisioning/control/check-in/maintenance and cloud filesystem create/edit/delete/mount/metrics services.  
   Targets: [src/packages/server/compute](./src/packages/server/compute), [src/packages/server/compute/cloud-filesystem](./src/packages/server/compute/cloud-filesystem), [src/packages/server/compute/maintenance](./src/packages/server/compute/maintenance).

6. **Schema + DB cleanup.**  
   Remove compute server and cloud filesystem tables and settings; update schema registry.  
   Targets: [src/packages/util/db-schema/compute-servers.ts](./src/packages/util/db-schema/compute-servers.ts), [src/packages/util/db-schema/cloud-filesystems.ts](./src/packages/util/db-schema/cloud-filesystems.ts), [src/packages/util/db-schema/site-defaults.ts](./src/packages/util/db-schema/site-defaults.ts), [src/packages/util/db-schema/site-settings-extras.ts](./src/packages/util/db-schema/site-settings-extras.ts), [src/packages/util/db-schema/purchases.ts](./src/packages/util/db-schema/purchases.ts), [src/packages/util/db-schema/purchase-quotas.ts](./src/packages/util/db-schema/purchase-quotas.ts), [src/packages/util/db-schema/index.ts](./src/packages/util/db-schema/index.ts).  
   Drop related virtual tables (compute_servers_by_course, crm_*), caches, and metrics.

7. **Billing + maintenance cleanup.**  
   Remove compute-server/cloud-filesystem purchase handling and cost estimation utilities.  
   Targets: [src/packages/server/compute/maintenance](./src/packages/server/compute/maintenance), [src/packages/util/compute](./src/packages/util/compute), [src/packages/util/db-schema/purchase-quotas.ts](./src/packages/util/db-schema/purchase-quotas.ts).

8. **I18n cleanup.**  
   Remove compute server/cloud filesystem strings and related keys from extracted/compiled translations.  
   Targets: [src/packages/frontend/i18n](./src/packages/frontend/i18n).

9. **Final sweep + validation.**  
   Ripgrep for `compute_server`, `compute-server`, `cloud_filesystem`, and `cloud-filesystem` in src/docs; confirm only unrelated cloud storage usage remains.  
   Run pnpm tsc --build (use NODE_OPTIONS if needed).

## \(done\) Remove Project Licenses \(replace with memberships\)

0. **Scope confirmation (from scan).**  
   Data model: [src/packages/util/db-schema/site-licenses.ts](./src/packages/util/db-schema/site-licenses.ts), [src/packages/util/db-schema/projects.ts](./src/packages/util/db-schema/projects.ts), [src/packages/util/db-schema/public-paths.ts](./src/packages/util/db-schema/public-paths.ts), [src/packages/util/types/site-licenses.ts](./src/packages/util/types/site-licenses.ts), [src/packages/util/consts/site-license.ts](./src/packages/util/consts/site-license.ts).  
   License application + analytics: [src/packages/database/postgres/site-license/hook.ts](./src/packages/database/postgres/site-license/hook.ts), [src/packages/database/postgres/site-license/usage-log.ts](./src/packages/database/postgres/site-license/usage-log.ts), [src/packages/database/postgres/site-license/search.ts](./src/packages/database/postgres/site-license/search.ts), [src/packages/database/postgres/site-license/public.ts](./src/packages/database/postgres/site-license/public.ts), [src/packages/database/postgres/site-license/manager.ts](./src/packages/database/postgres/site-license/manager.ts), [src/packages/database/postgres-server-queries.coffee](./src/packages/database/postgres-server-queries.coffee).  
   Server endpoints + purchase flow: [src/packages/server/licenses/get-license.ts](./src/packages/server/licenses/get-license.ts), [src/packages/server/licenses/get-projects-with-license.ts](./src/packages/server/licenses/get-projects-with-license.ts), [src/packages/server/licenses/purchase/create-license.ts](./src/packages/server/licenses/purchase/create-license.ts), [src/packages/server/purchases/edit-license.ts](./src/packages/server/purchases/edit-license.ts), [src/packages/server/purchases/edit-license-owner.ts](./src/packages/server/purchases/edit-license-owner.ts), [src/packages/server/public-paths/site-license-id.ts](./src/packages/server/public-paths/site-license-id.ts), [src/packages/next/pages/api/v2/licenses/get-license.ts](./src/packages/next/pages/api/v2/licenses/get-license.ts), [src/packages/next/pages/api/v2/licenses/get-projects-with-license.ts](./src/packages/next/pages/api/v2/licenses/get-projects-with-license.ts), [src/packages/next/pages/api/v2/purchases/edit-license.ts](./src/packages/next/pages/api/v2/purchases/edit-license.ts), [src/packages/next/pages/api/v2/purchases/edit-license-owner.ts](./src/packages/next/pages/api/v2/purchases/edit-license-owner.ts), [src/packages/next/pages/api/v2/projects/public-path-license.ts](./src/packages/next/pages/api/v2/projects/public-path-license.ts).  
   Frontend UI (project + account): [src/packages/frontend/site-licenses](./src/packages/frontend/site-licenses), [src/packages/frontend/account/licenses](./src/packages/frontend/account/licenses), [src/packages/frontend/project/settings/site-license.tsx](./src/packages/frontend/project/settings/site-license.tsx), [src/packages/frontend/project/page/project-licenses.tsx](./src/packages/frontend/project/page/project-licenses.tsx), [src/packages/frontend/project/page/flyouts/licenses.tsx](./src/packages/frontend/project/page/flyouts/licenses.tsx), [src/packages/frontend/purchases/edit-license.tsx](./src/packages/frontend/purchases/edit-license.tsx), [src/packages/frontend/purchases/license-editor.tsx](./src/packages/frontend/purchases/license-editor.tsx), [src/packages/frontend/admin](./src/packages/frontend/admin), [src/packages/frontend/frame-editors/crm-editor/tables/site-licenses.ts](./src/packages/frontend/frame-editors/crm-editor/tables/site-licenses.ts).  
   Store/Next UI: [src/packages/next/components/store/site-license.tsx](./src/packages/next/components/store/site-license.tsx), [src/packages/next/components/store/site-license-cost.tsx](./src/packages/next/components/store/site-license-cost.tsx), [src/packages/next/components/store/apply-license-to-project.tsx](./src/packages/next/components/store/apply-license-to-project.tsx), [src/packages/next/components/licenses](./src/packages/next/components/licenses), [src/packages/next/components/misc/select-site-license.tsx](./src/packages/next/components/misc/select-site-license.tsx).  
   Utilities: [src/packages/util/licenses](./src/packages/util/licenses), [src/packages/util/purchases/cost-to-edit-license.ts](./src/packages/util/purchases/cost-to-edit-license.ts).  
   Tests: [src/packages/server/purchases/edit-license.test.ts](./src/packages/server/purchases/edit-license.test.ts), [src/packages/database/postgres/site-license](./src/packages/database/postgres/site-license), [src/packages/util/quota.test.ts](./src/packages/util/quota.test.ts).  
   Keep: software licenses remain in [src/packages/util/db-schema/software-licenses.ts](./src/packages/util/db-schema/software-licenses.ts) and [src/packages/server/software-licenses](./src/packages/server/software-licenses).

1. **Remove purchase + management entry points (frontend + store).**  
   Delete license pages, menus, and flows that let users view/apply/edit licenses; replace any remaining CTAs with membership flows.  
   Targets: [src/packages/frontend/account/licenses](./src/packages/frontend/account/licenses), [src/packages/frontend/site-licenses](./src/packages/frontend/site-licenses), [src/packages/frontend/project/settings/site-license.tsx](./src/packages/frontend/project/settings/site-license.tsx), [src/packages/frontend/project/page/project-licenses.tsx](./src/packages/frontend/project/page/project-licenses.tsx), [src/packages/frontend/project/page/flyouts/licenses.tsx](./src/packages/frontend/project/page/flyouts/licenses.tsx), [src/packages/frontend/purchases/edit-license.tsx](./src/packages/frontend/purchases/edit-license.tsx), [src/packages/frontend/purchases/license-editor.tsx](./src/packages/frontend/purchases/license-editor.tsx), [src/packages/frontend/admin](./src/packages/frontend/admin), [src/packages/frontend/frame-editors/crm-editor/tables/site-licenses.ts](./src/packages/frontend/frame-editors/crm-editor/tables/site-licenses.ts).  
   Store: remove license products/flows from [src/packages/next/components/store/site-license.tsx](./src/packages/next/components/store/site-license.tsx), [src/packages/next/components/store/site-license-cost.tsx](./src/packages/next/components/store/site-license-cost.tsx), [src/packages/next/components/store/apply-license-to-project.tsx](./src/packages/next/components/store/apply-license-to-project.tsx), and any links in store menus.

2. **Remove license API endpoints + server purchase/edit code.**  
   Delete license endpoints and purchase/edit handlers; ensure no API routes expect license IDs.  
   Targets: [src/packages/server/licenses](./src/packages/server/licenses), [src/packages/server/purchases/edit-license.ts](./src/packages/server/purchases/edit-license.ts), [src/packages/server/purchases/edit-license-owner.ts](./src/packages/server/purchases/edit-license-owner.ts), [src/packages/server/public-paths/site-license-id.ts](./src/packages/server/public-paths/site-license-id.ts), [src/packages/next/pages/api/v2/licenses](./src/packages/next/pages/api/v2/licenses), [src/packages/next/pages/api/v2/purchases/edit-license.ts](./src/packages/next/pages/api/v2/purchases/edit-license.ts), [src/packages/next/pages/api/v2/purchases/edit-license-owner.ts](./src/packages/next/pages/api/v2/purchases/edit-license-owner.ts), [src/packages/next/pages/api/v2/projects/public-path-license.ts](./src/packages/next/pages/api/v2/projects/public-path-license.ts).

3. **Remove license application pipeline from project runtime.**  
   Delete the site-license hook and usage tracking, and remove project-level license evaluation when starting/running projects.  
   Targets: [src/packages/database/postgres/site-license/hook.ts](./src/packages/database/postgres/site-license/hook.ts), [src/packages/database/postgres/site-license/usage-log.ts](./src/packages/database/postgres/site-license/usage-log.ts), [src/packages/database/postgres/site-license/search.ts](./src/packages/database/postgres/site-license/search.ts), [src/packages/database/postgres/site-license/manager.ts](./src/packages/database/postgres/site-license/manager.ts), [src/packages/database/postgres/site-license/public.ts](./src/packages/database/postgres/site-license/public.ts), [src/packages/database/postgres-server-queries.coffee](./src/packages/database/postgres-server-queries.coffee).  
   Ensure quota calculations no longer accept site_licenses inputs or emit license-related fields for projects.

4. **Schema + DB cleanup.**  
   Remove site license tables, schema, and project/public-path fields tied to licenses.  
   Targets: [src/packages/util/db-schema/site-licenses.ts](./src/packages/util/db-schema/site-licenses.ts), [src/packages/util/db-schema/projects.ts](./src/packages/util/db-schema/projects.ts), [src/packages/util/db-schema/public-paths.ts](./src/packages/util/db-schema/public-paths.ts).  
   Drop related indexes/queries (e.g., site_license, site_license_usage_log) and any migration hooks.  
   Note: this does not touch software license schema in [src/packages/util/db-schema/software-licenses.ts](./src/packages/util/db-schema/software-licenses.ts).

5. **Types + util cleanup.**  
   Remove site-license types, constants, and helpers.  
   Targets: [src/packages/util/types/site-licenses.ts](./src/packages/util/types/site-licenses.ts), [src/packages/util/consts/site-license.ts](./src/packages/util/consts/site-license.ts), [src/packages/util/licenses](./src/packages/util/licenses), [src/packages/util/purchases/cost-to-edit-license.ts](./src/packages/util/purchases/cost-to-edit-license.ts).

6. **Tests + docs sweep.**  
   Remove license-specific tests and docs copy; confirm memberships are the only upgrade path.  
   Targets: [src/packages/server/purchases/edit-license.test.ts](./src/packages/server/purchases/edit-license.test.ts), [src/packages/database/postgres/site-license](./src/packages/database/postgres/site-license), docs that reference site licenses or license keys.  
   Review: pnpm tsc --build for frontend/server/next and any affected tests.

7. **Final audit.**  
   Ripgrep for site_license, licenses, and license_id across src and docs; confirm no references remain beyond software licenses.

## \(done\) Rename: Project \-&gt; Workspace in frontend UI

1. **Terminology helper + i18n keys.**  
   Reuse labels.project and labels.projects, but update their values to "Workspace" and "Workspaces" in [src/packages/frontend/i18n/common.ts](./src/packages/frontend/i18n/common.ts), then propagate to locale files that mirror common labels.  
   Prefer labels.project(s) anywhere a user-visible "Project" appears; only add new keys if a screen truly needs both terms at once.  
   For the Next/store/marketing app, introduce a tiny helper (e.g., a constants module in src/packages/next) that reads the same terminology so copy stays consistent.

2. **Inventory user-visible strings.**  
   Use ripgrep to list "Project"/"project" occurrences in [src/packages/frontend](./src/packages/frontend) and [src/packages/next](./src/packages/next), then classify into:  
   (a) user-facing UI text, (b) server/API identifiers (project_id, URLs, schema names), (c) internal labels or code comments.  
   Only update (a). Leave DB/API names intact.

3. **Frontend app replacements (logged-in UI).**  
   Replace user-visible "Project(s)" with labels.project(s) in navigation, project list, create-project flows, settings, sharing/invites, quotas, membership messaging, and modal copy.  
   Update hard-coded strings in components under [src/packages/frontend](./src/packages/frontend) to use labels.project(s) and keep pluralization consistent.
   Ensure pluralization and possessives read naturally (e.g., "Workspace settings", "Open workspace", "Workspace ID").

4. **Store/marketing replacements (Next).**  
   Update strings in [src/packages/next/pages](./src/packages/next/pages) and [src/packages/next/components](./src/packages/next/components) to use workspace terminology, including pricing, store, landing, and feature pages.  
   Apply the shared helper (mirroring labels.project(s)) to keep copy consistent and reduce future churn.

5. **Edge cases + exceptions.**  
   Keep technical identifiers and URLs (project_id, /projects routes, API names) unchanged.  
   Decide on compound terms (e.g., "project host" -> "workspace host") and document those choices for consistent copy updates.  
   Decision: use "workspace host(s)" in user-facing copy; keep internal `project-host` ids, `project_host` fields, and `/projects` routes/URL paths unchanged.

6. **QA + validation.**  
   Run search for leftover user-facing "Project" in frontend/next files, leaving only technical identifiers.  
   Spot-check key flows (create workspace, settings, share, membership modal, store pages) and run pnpm tsc --build for frontend/next.

