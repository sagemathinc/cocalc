// `analytics` is a generalized wrapper for reporting data to google analytics, pwiki, parsley, ...
// for now, it either does nothing or works with GA
// this API basically allows to send off events by name and category

const analytics = function(type, ...args) {
  // GoogleAnalyticsObject contains the possibly customized function name of GA.
  // It's a good idea to call it differently from the default 'ga' to avoid name clashes...
  if ((window as any).GoogleAnalyticsObject != undefined) {
    const ga = window[(window as any).GoogleAnalyticsObject];
    if (ga != undefined) {
      switch (type) {
        case "event":
        case "pageview":
          return ga("send", type, ...args);
        default:
          return console.warn(`unknown analytics event '${type}'`);
      }
    }
  }
};

export const analytics_pageview = (...args) => analytics("pageview", ...args);
export const analytics_event = (...args) => analytics("event", ...args);
