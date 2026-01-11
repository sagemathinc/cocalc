# Membership System Plan (CoCalc 2)

## Goals

- Simple, predictable membership classes: free, student, member, pro.
- Ownership-based defaults: project owner membership sets default quotas when a project starts.
- Custom project hosts remain pay-as-you-go infrastructure with owner-defined policies.
- Transparent usage and limits (especially LLM usage), only surfaced when users approach or hit limits.

## Non-Goals (initial rollout)

- Fully removing legacy purchases in one step.
- Rewriting billing beyond what is needed to support membership sources and entitlements.

## Membership Model

### Membership classes

- **free**: minimal resources and usage limits.
- **student**: course-bound access for a fixed term (e.g., 4 months).
- **member**: monthly subscription with higher limits and feature access.
- **pro**: higher monthly tier with premium limits and priority.

### Membership sources (how a user becomes a class)

- Self-pay subscription (monthly or yearly).
- Course purchase (time-limited).
- Organization entitlement (contracted).
- Promotions or credits (time-limited).

### Resolution rules (single effective class)

- Compute a single effective class per account, based on priority and expiration.
- Suggested priority: org > self-pay > course > promo > free.
- Expiration always applies; highest valid class wins.

## Entitlements

### Entitlement types

- LLM usage: calls/tokens per rolling window.
- Disk: total allocation cap, and per-project defaults.
- Compute: CPU priority, idle timeout, max running projects.
- Feature access: custom project hosts, external storage mounts, etc.

### Derivation

- `entitlements(account)` is a computed view from the effective membership class.
- On project start, resolve effective project quotas from:
  1. Project owner entitlements.
  2. Host policy (if running on a custom project host, host policy overrides).

## Project Hosts (Custom)

- Custom hosts are purchased independently (pay-as-you-go VM cost).
- Host owner can set per-project quotas and policies for projects running there.
- Custom host policies override membership defaults for projects on that host.

## User Experience

- Clear membership status page: class, source, renewal, and usage.
- Transparent usage for LLM and storage; show remaining quota and reset window.
- Upgrade paths: “why you’re limited” and “what changes if you upgrade.”

## CoCalc Plus (Desktop App)

- Base app is free to install/use.
- Membership unlocks:
  - LLM/agent usage proxied via cocalc.com (no personal API key required).
  - Bidirectional file sync between local folders and cloud projects, with realtime collab editing.

## Migration Strategy

- Map existing project licenses to membership classes:
  - License tiers map to member/pro with fixed end dates.
  - Remaining value is preserved via time credits.
- Legacy purchases continue to work during transition via a compatibility layer.

## Implementation Sketch

### Data model

- `account_membership` table: class, source_type, start/end, metadata.
- `account_entitlements` materialized or computed view.
- Optional `membership_events` for audit and transparency.

### APIs

- `GET /membership/status`: class, source, expiry, renewal.
- `GET /membership/entitlements`: resolved limits for the account.
- `GET /membership/usage`: usage and throttles for LLM/storage.

### Frontend

- New membership dashboard and store flows.
- Replace project-license-centric UI with membership-centric UI.
- Maintain legacy UI in parallel until migration completes.

## Concrete Transition Checklist (Minimal Branching)

Details to not forget:

- [ ] in the store, do not allow "buy it again" for memberships.

### \(done\) Phase 1: Core membership model \+ billing reuse

[x] Extend subscription metadata to include `type:"membership"` and membership class in [src/packages/util/db\-schema/subscriptions.ts](./src/packages/util/db-schema/subscriptions.ts). \(easy\)  
[x] Add a membership resolver module \(e.g., `src/packages/server/membership/resolve.ts`\) that returns effective class \+ entitlements for an account \(self\-pay subscription, course, org\). \(medium\)  
[x] Add central membership tier config in server settings \(single JSON\) consumed by the resolver in [src/packages/database/settings/server\-settings.ts](./src/packages/database/settings/server-settings.ts). \(medium\)  
[x] Update subscription creation to allow membership metadata in [src/packages/server/purchases/create\-subscription.ts](./src/packages/server/purchases/create-subscription.ts) without touching `site_licenses`. \(easy\)  
[x] Update renewal/resume logic to branch on `metadata.type` in [src/packages/server/purchases/renew\-subscription.ts](./src/packages/server/purchases/renew-subscription.ts) and [src/packages/server/purchases/resume\-subscription.ts](./src/packages/server/purchases/resume-subscription.ts); for membership, just extend subscription period and skip license edits. \(medium\)  
[x] Update subscription payment flow to branch on `metadata.type` in [src/packages/server/purchases/stripe/create\-subscription\-payment.ts](./src/packages/server/purchases/stripe/create-subscription-payment.ts); for membership, compute new period end without touching `site_licenses`. \(medium\)  
[x] Update subscription maintenance messaging to describe memberships in [src/packages/server/purchases/maintain\-subscriptions.ts](./src/packages/server/purchases/maintain-subscriptions.ts) and [src/packages/server/purchases/subscription\-renewal\-emails.ts](./src/packages/server/purchases/subscription-renewal-emails.ts). \(easy\)

Exit criteria: membership subscriptions can be created, billed, renewed, and displayed in backend APIs without touching licenses.  
Risks/unknowns: metadata branching might miss legacy flows; subscription UI assumes license metadata in multiple places.

### Phase 2: Entitlements applied to projects + usage

[x] Implement membership quota injection at the project quota choke point in [src/packages/server/projects/control/base.ts](./src/packages/server/projects/control/base.ts), using a “membership license” object or direct quota input. \(hard\)  
[x] Replace per\-call LLM purchase line items with usage counters and limits from membership entitlements in [src/packages/server/purchases/purchase\-quotas.ts](./src/packages/server/purchases/purchase-quotas.ts). \(hard\)  
[x] Add a membership entitlements helper \(resolve \+ normalize\) that returns project defaults, LLM limits, and feature flags in one shape for downstream use. \(medium\)  
[x] Define LLM usage windows \(e.g., 5\-hour burst \+ 7\-day rolling\) and persist usage counters with clear reset semantics. \(hard\)  
[x] Surface “why limited” metadata to clients \(limit type, remaining, reset time\) for transparency. \(medium\)  
[ ] Add targeted tests for entitlement resolution and quota application on project start. \(medium\)  
[x] Add unit tests for membership purchase and upgrade \(prorated credit\). \(medium\)

Exit criteria: project defaults and LLM usage limits are governed by membership entitlements with no per-call purchase spam.  
Risks/unknowns: quota injection could conflict with legacy site_license stacking; LLM usage accounting needs a clear reset window and storage model.

### Phase 3: UI and migration/compatibility

[x] Add membership\-aware UI rendering in [src/packages/frontend/purchases/subscriptions.tsx](./src/packages/frontend/purchases/subscriptions.tsx) and [src/packages/next/components/billing/subscriptions.tsx](./src/packages/next/components/billing/subscriptions.tsx) \(show membership class instead of license id\). \(medium\)  
[ ] Remove project-license UI from the app and store; keep only software licenses for onprem. \(medium\)  
[ ] Add in-app membership purchase links to the store \(settings, subscriptions, upgrade CTAs\). \(easy\)  
[ ] If legacy project licenses must remain accessible, move them behind an admin-only or advanced path. \(medium\)  
[ ] Add migration/compat mapping: map existing license subscriptions to membership classes and preserve remaining value \(advanced/legacy still available\). \(hard\)

[ ] Replace raw JSON editing in membership tier admin UI with structured editors for `project_defaults`, `llm_limits`, and `features`, including validation and hints. \(medium\)

[x] Add buying membership to the store \(hard\)

UI todo (store + settings):

[ ] Add a membership status panel: tier, source, renewal/expiry, and usage summary, with "manage membership" or "upgrade" CTAs. (medium)  
[ ] Show membership tier and benefits in account preferences (and optionally a top-level badge). (easy)  
[ ] Link all "upgrade" affordances to the membership store; remove license-based upgrade copy. (easy)  
[ ] Remove or hide project-license purchase UI and references in settings, project views, and purchases. (medium)  
[ ] Add "current plan" badges and disable CTA buttons accordingly on membership cards. (easy)  
[ ] Show a prorated credit line item on checkout when upgrading member -> pro. (medium)  
[ ] Add a "why limited?" callout with upgrade links on LLM throttles and project start limits. (medium)  
[ ] Hide membership "buy it again" and "saved for later" flows. (easy)  
[ ] Add clear "what you get" copy/feature summaries in store + settings. (medium)

Exit criteria: users can see membership subscriptions and status in UI, project-license UI is removed from standard flows, and existing paid value is preserved.  
Risks/unknowns: migration mapping could under/over-credit value; any legacy license access needs a safe admin/advanced path.

## Open Questions

- Final numeric limits per class.
- How to surface “owner determines project limits” to collaborators.
- How to handle multiple active sources (stacking vs override).
- Whether to allow dynamic tier names beyond free/member/pro (and how to keep store UI simple).

## Competitive Comparison (User Expectations)

- Membership tiers mirror standard SaaS plans: free → student/course → personal → pro.
- Ownership-based entitlements match the “account tier drives project limits” model.
- Custom project hosts align with “bring-your-own-infra + platform fee” used by modern data/ML platforms.
- Clear separation of “membership features/limits” vs “infrastructure cost” reduces confusion compared to per-project licensing.

## Dynamic Tiers (Implemented)

### Status

- Membership tiers now live in a dedicated table and are fully dynamic.
- Store and resolver use table-driven tiers and priority.
- Admin UI exists but uses raw JSON for complex fields (needs a structured editor).

Risks/unknowns: multiple tier sources (org/course/subscription) need consistent conflict resolution; upgrade path rules for non-linear tiers need a simple policy.

## Current Status Summary

- Core membership backend is implemented and tested \(purchase + upgrade with proration\).
- Membership tiers are stored in a dedicated table and used by resolver + store.
- LLM usage is membership-based \(no pay-as-you-go\), with 5-hour + 7-day limits and usage status surfaced in UI.
- UI still lacks membership status/benefits surfaces, in-app membership purchase links, and removal of project-license UI.
- Admin membership tier editing still relies on raw JSON for entitlements and needs a structured editor.

## Phase 4 (Planned): Team + Course Memberships (replace licenses)

Goal: enable membership-only operation \(for cocalc.ai\) without licenses, by supporting org/team seats and course purchases.

Proposed membership sources:

- **Org/Team plan**: subscription with seats; owner assigns accounts to seats.
- **Course plan**: one-time purchase for a class term; instructor assigns students; auto-expire.

Changes needed:

- Data model: `org_membership_grants` and `course_membership_grants` tables, plus assignment tables.
- Resolver: include org/course sources and seat allocation logic.
- UI: admin/instructor tools to manage seats and assignments.
- Store: team plan purchase flow and course purchase flow \(non-renewing\).

Exit criteria: memberships cover the same real-world cases as licenses; licenses can be removed from cocalc.ai.

## Bridge Solution (Before Team Plans Land)

- Allow **project default tier** chosen by the owner, with **soft downgrade** when a free user starts a project.
- Allow a **sponsor this run** upgrade from any collaborator.
- Add a **team trial** (time‑boxed + seat‑limited) so owners can onboard collaborators without immediate payment.

## cocalc.ai Launch Strategy

- Keep cocalc.com as-is initially; launch cocalc.ai membership-only.
- Provide an explicit import flow to migrate projects + subscriptions opt-in.
- No automatic conversion of legacy licenses; use import tooling to map to memberships.

## Forward Plan (Ordering)

1. **UX clarity + admin editing**: membership status UI, upgrade links, and structured editors for LLM limits / project defaults / features.
2. **Entitlement tests**: add targeted tests for project quota injection and entitlement resolution.
3. **Team/Course sources**: build data model + resolver support for seats and courses.
4. **Team/Course UI + store**: purchase flows, assignment UI, seat management.
5. **License retirement for cocalc.ai**: remove project licenses from store/UI; rely on team/course memberships.
