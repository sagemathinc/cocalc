declare var navigator;

export default function browserInfo(): {
  userAgent?: string;
  browser:
    | "chrome"
    | "firefox"
    | "safari"
    | "ios"
    | "ipados"
    | "other"
    | "node";
  context?: string; // could get filled in later by caller with some extra info.
} {
  const userAgent = navigator?.userAgent;
  if (!userAgent) {
    return { userAgent, browser: "node" };
  }

  let browser;
  let useragent = userAgent.toLowerCase();
  if (/chrom(e|ium)/.test(useragent)) {
    browser = "chrome";
  } else if (useragent.includes("firefox")) {
    browser = "firefox";
  } else if (
    useragent.match(/Mac/) &&
    navigator.maxTouchPoints &&
    navigator.maxTouchPoints > 2
  ) {
    browser = "ipados";
  } else if (useragent.match(/iPhone|iPod/i)) {
    browser = "ios";
  } else if (useragent.includes("safari")) {
    browser = "safari";
  } else {
    browser = "other";
  }
  return { userAgent, browser };
}
