/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// `analytics` is a generalized wrapper for reporting data to google analytics, pwiki, parsley, ...
// for now, it either does nothing or works with GTAG
// this API basically allows to send off events by name and category

function analytics(type: "event" | "pageview", ...args): void {
  // GoogleGTag contains the possibly customized function name of GA.
  // It's a good idea to call it differently from the default 'gtag' to avoid name clashes...
  // see webapp-lib/_inc_analytics.pug
  const gtag: any = (window as any).GoogleGTag;
  const pv: any = (window as any).GoogleGTagPageview;
  if (gtag == null || pv == null) return;
  switch (type) {
    case "event":
      gtag("event", args[0], {
        event_category: args[1],
        event_label: args[2],
        value: args[3],
      });
      return;
    case "pageview":
      pv(location.pathname);
      return;
    default:
      console.warn(`unknown analytics event '${type}'`);
      return;
  }
}

export function analytics_pageview(): void {
  analytics("pageview");
}

export function analytics_event(...args): void {
  analytics("event", ...args);
}

export function user_activity(..._args): void {
  // NOOP. arguments are tree like chains, where leaves are options/actions.
  // the use case is to track certain UI usage of users to learn what is used and how.
  // the reporting aspect must be reported properly.
}
