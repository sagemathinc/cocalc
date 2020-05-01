/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// `analytics` is a generalized wrapper for reporting data to google analytics, pwiki, parsley, ...
// for now, it either does nothing or works with GA
// this API basically allows to send off events by name and category

function analytics(type: "event" | "pageview", ...args): void {
  // GoogleAnalyticsObject contains the possibly customized function name of GA.
  // It's a good idea to call it differently from the default 'ga' to avoid name clashes...
  if ((window as any).GoogleAnalyticsObject == null) {
    return; // GA not available
  }
  const ga: any = window[(window as any).GoogleAnalyticsObject];
  if (ga == null) {
    return; // GA still not available again?
  }
  switch (type) {
    case "event":
    case "pageview":
      ga("send", type, ...args);
      return;
    default:
      console.warn(`unknown analytics event '${type}'`);
      return;
  }
}

export function analytics_pageview(...args): void {
  analytics("pageview", ...args);
}

export function analytics_event(...args): void {
  analytics("event", ...args);
}
