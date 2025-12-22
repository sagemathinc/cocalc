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

[ ] Implement membership quota injection at the project quota choke point in [src/packages/server/projects/control/base.ts](./src/packages/server/projects/control/base.ts), using a “membership license” object or direct quota input. (hard)  
[ ] Replace per-call LLM purchase line items with usage counters and limits from membership entitlements in [src/packages/server/purchases/purchase-quotas.ts](./src/packages/server/purchases/purchase-quotas.ts). (hard)  
[ ] Add a membership entitlements helper (resolve + normalize) that returns project defaults, LLM limits, and feature flags in one shape for downstream use. (medium)  
[ ] Define LLM usage windows (e.g., 5-hour burst + 7-day rolling) and persist usage counters with clear reset semantics. (hard)  
[ ] Surface “why limited” metadata to clients (limit type, remaining, reset time) for transparency. (medium)  
[ ] Add targeted tests for entitlement resolution and quota application on project start. (medium)  

Exit criteria: project defaults and LLM usage limits are governed by membership entitlements with no per-call purchase spam.  
Risks/unknowns: quota injection could conflict with legacy site_license stacking; LLM usage accounting needs a clear reset window and storage model.  

### Phase 3: UI and migration/compatibility

[x] Add membership\-aware UI rendering in [src/packages/frontend/purchases/subscriptions.tsx](./src/packages/frontend/purchases/subscriptions.tsx) and [src/packages/next/components/billing/subscriptions.tsx](./src/packages/next/components/billing/subscriptions.tsx) \(show membership class instead of license id\). \(medium\)  
[ ] Keep legacy license subscriptions visible under an “Advanced” tab or section in [src/packages/next/components/store](./src/packages/next/components/store). \(easy\)  
[ ] Add migration/compat mapping: map existing license subscriptions to membership classes and preserve remaining value \(advanced/legacy still available\). \(hard\)

[ ] Make the Membership Tiers admin configuration user friendly \(custom react component form\), after deciding what the options are.  Right now it's a just a mystery json blob \(medium\)

[x] Add buying membership to the store \(hard\)

UI todo (store + settings):

[ ] Add “current plan” badges and disable CTA buttons accordingly on membership cards. (easy)  
[ ] Show a prorated credit line item on checkout when upgrading member → pro. (medium)  
[ ] Add a membership status panel in settings: class, source, renewal date, and usage summary. (medium)  
[ ] Add a “why limited?” callout with upgrade links on LLM throttles and project start limits. (medium)  
[ ] Hide membership “buy it again” and “saved for later” flows. (easy)  

Exit criteria: users can see membership subscriptions in UI, legacy licenses remain accessible, and existing paid value is preserved.  
Risks/unknowns: migration mapping could under/over-credit value; “advanced” legacy UX needs careful labeling to avoid confusion.  

## Open Questions

- Final numeric limits per class.
- How to surface “owner determines project limits” to collaborators.
- How to handle multiple active sources (stacking vs override).

## Competitive Comparison (User Expectations)

- Membership tiers mirror standard SaaS plans: free → student/course → personal → pro.
- Ownership-based entitlements match the “account tier drives project limits” model.
- Custom project hosts align with “bring-your-own-infra + platform fee” used by modern data/ML platforms.
- Clear separation of “membership features/limits” vs “infrastructure cost” reduces confusion compared to per-project licensing.
