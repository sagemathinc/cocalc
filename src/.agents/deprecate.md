# Deprecating old Functionality for [CoCalc.ai](http://CoCalc.ai)

Goal: Complete remove all code and functionality for the following:

- [x] payg project upgrades
- [ ] project licenses
- [x] legacy upgrades \(from 2020 and earlier\)
- [ ] Sage worksheets: opening a sagews should convert it to ipynb automatically \(if ipynb doesn't exist already\), then open that. Nothing else.
- [ ] payg LLM purchases
- [ ] all code involving compute\_servers
- [x] dedicated\_vms and dedicated\_disks
- [ ] GPU licenses
- [ ] public projects, i.e., most anything involving an is\_project flag in the frontend
- [ ] jitsi \-\- video chat
- [ ] rename: "Project" \-\-&gt; "Workspace" in frontend UI

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


## Rename: Project -> Workspace in frontend UI

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

6. **QA + validation.**  
   Run search for leftover user-facing "Project" in frontend/next files, leaving only technical identifiers.  
   Spot-check key flows (create workspace, settings, share, membership modal, store pages) and run pnpm tsc --build for frontend/next.
