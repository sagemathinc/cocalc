/*
Redirects so that all of the URL's for the old landing
pages work with the new next.js implementation.

The mapping is as follows, with the first match winning:

    /index.html --> /

    /policies/pricing.html --> /pricing
    /policies/index.html --> /policies
    /policies/[page].html -> /policies/[page]

    /doc/software.html --> /software
    /doc/software-[name].html --> /software/[name]

    /doc/index.html --> /features
    /doc/[page].html --> /features/[page]

This is defined in the "RULES" array below.
*/

import { join } from "path";
import { NextFunction, Request, Response } from "express";
import { getLogger } from "@cocalc/hub/logger";
import basePath from "@cocalc/backend/base-path";

const CODE = 301; // permanent redirect

const logger = getLogger("landing-redirect");

const RULES = [
  { start: join(basePath, "index.html"), to: basePath },
  {
    start: join(basePath, "policies/pricing.html"),
    to: join(basePath, "pricing"),
  },
  {
    start: join(basePath, "policies/index.html"),
    to: join(basePath, "policies"),
  },
  {
    start: join(basePath, "policies/"),
    to: (url) => url.slice(0, url.length - ".html".length),
  },
  {
    start: join(basePath, "doc/software.html"),
    to: join(basePath, "/software"),
  },
  {
    start: join(basePath, "doc/software-"),
    to: (url) => {
      const i = url.lastIndexOf("/doc/software-");
      return `${url.slice(0, i)}/software/${url.slice(
        i + "/doc/software-".length,
        url.length - ".html".length
      )}`;
    },
  },
  { start: join(basePath, "doc/index.html"), to: join(basePath, "/features") },
  {
    start: join(basePath, "doc/"),
    to: (url) => {
      const i = url.lastIndexOf("/doc/");
      return `${url.slice(0, i)}/features/${url.slice(
        i + "/doc/".length,
        url.length - ".html".length
      )}`;
    },
  },
];

export default function redirect() {
  const doc = join(basePath, "doc/");
  const policies = join(basePath, "policies/");
  const index_html = join(basePath, "index.html");

  logger.info("creating landing pages legacy redirect");
  return async (req: Request, res: Response, next: NextFunction) => {
    const { url } = req;
    //logger.http("redirect %s", url);

    // Check for a quick obvious "no".
    if (
      !url.endsWith(".html") ||
      !(url.startsWith(doc) || url.startsWith(policies) || url == index_html)
    ) {
      // The url doesn't ended in html or it doesn't start with /doc or /policies,
      // so clearly not going to redirect it.
      next();
      return;
    }

    // Now the url does start with either doc or policies and ends in .html,
    // so we are definitely going to redirect (or fail), since NONE of the new
    // nextjs pages end in .html and there's nothing else under /doc or /policies.
    for (const rule of RULES) {
      if (url.startsWith(rule.start)) {
        const { to } = rule;
        let dest;
        if (typeof to == "string") {
          dest = to;
        } else {
          dest = to(url);
        }
        logger.http("landing redirect ", url, " --> ", dest);
        res.redirect(CODE, dest);
        return;
      }
    }
    logger.http("landing redirect NOT found for ", url);
    res.status(404).end();
  };
}
