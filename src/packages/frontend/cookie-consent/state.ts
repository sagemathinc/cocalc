/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Tiny shared-state module so ./init can flip flags that ./index reads,
// without a circular import. Importing this module is side-effect free.
//
// Three observable states:
//   undecided → customize hasn't loaded yet, we don't know if the banner
//               will activate. Gate helpers should be conservative (treat
//               as "not yet acknowledged") so modals like verify-email
//               don't render on top of a banner that's about to appear.
//   active    → initCookieConsent ran with enabled=true; v3 runtime is up.
//   decided-disabled → admin has the banner off; helpers pass through.

const EVENT_NAME = "cc:internalStateChange";

let active = false;
let decided = false;

function emit(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

export function markBannerActive(): void {
  active = true;
  decided = true;
  emit();
}

export function markBannerDecidedDisabled(): void {
  // active stays false. decided=true tells helpers to stop being conservative.
  decided = true;
  emit();
}

export function isBannerActive(): boolean {
  return active;
}

export function isBannerDecided(): boolean {
  return decided;
}

export const BANNER_STATE_EVENT = EVENT_NAME;
