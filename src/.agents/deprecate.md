# Deprecating old Functionality for [CoCalc.ai](http://CoCalc.ai)

Goal: Complete remove all code and functionality for the following:

- [ ] public jupyter api
- [ ] Sage worksheets: opening a sagews should convert it to ipynb automatically \(if ipynb doesn't exist already\), then open that. Nothing else.
- [ ] payg LLM purchases
- [ ] all code involving compute\_servers and cloud filesystems
- [ ] anonymous accounts / sign up
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

## Remove Anonymous Accounts (no email/passport auth)

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

## Remove Project Licenses (replace with memberships)

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
