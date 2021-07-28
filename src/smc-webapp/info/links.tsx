/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import * as React from "react";
import { DOMAIN_URL} from "smc-util/theme";
import { BASE_URL as DEFAULT_BASE_URL } from "smc-webapp/misc/base-url";
import { SiteName, PolicyPricingPageUrl } from "../customize";
import { IconName } from "smc-webapp/r_misc/icon";

const BASE_URL = global["BACKEND"] ? DOMAIN_URL : DEFAULT_BASE_URL;

import {
  HELP_EMAIL,
  DOC_URL,
  TWITTER_HANDLE,
  LIVE_DEMO_REQUEST,
  DISCORD_INVITE,
} from "smc-util/theme";

interface LinkInfo {
  commercial?: boolean;
  bold?: boolean;
  icon: IconName;
  href?: string;
  link?: JSX.Element | string;
  text?: JSX.Element | string;
}

export type Links = { [name: string]: LinkInfo };

export const SUPPORT_LINKS: Links = {
  email_help: {
    commercial: true,
    bold: true,
    icon: "envelope",
    href: "mailto:" + HELP_EMAIL,
    link: HELP_EMAIL,
    text: "Please include the URL link to the relevant project or file!",
  },
  doc: {
    icon: "book",
    bold: true,
    href: DOC_URL,
    link: (
      <span>
        <SiteName /> manual
      </span>
    ),
  },
  teaching: {
    commercial: true,
    icon: "graduation-cap",
    href: "https://doc.cocalc.com/teaching-instructors.html",
    link: (
      <span>
        The Instructor Guide: How to teach a course with <SiteName />
      </span>
    ),
  },
  live_demo: {
    commercial: true,
    icon: "comment",
    link: (
      <span>
        Request a live video chat with the <SiteName /> developers about how to
        teach a course. We will get back to you quickly and answer all of your
        questions.
      </span>
    ),
    href: LIVE_DEMO_REQUEST,
  },
  pricing: {
    icon: "money",
    href: PolicyPricingPageUrl,
    link: "Pricing and subscription options",
    commercial: true,
  },
  cocalc_api: {
    icon: "gears",
    href: "https://doc.cocalc.com/api/",
    link: <span>Embed and control CoCalc using the API</span>,
  },
  desktop: {
    commercial: true,
    icon: "desktop",
    href: "https://github.com/sagemathinc/cocalc-desktop#readme",
    link: (
      <span>Install the CoCalc desktop application for Windows and MacOS</span>
    ),
  },
  docker_image: {
    commercial: true,
    icon: "window-maximize",
    href: "https://github.com/sagemathinc/cocalc-docker#readme",
    link: (
      <span>
        Easily run your own CoCalc server (commercial support available)
      </span>
    ),
  },
  kubernetes_image: {
    commercial: true,
    icon: "window-maximize",
    href: "https://github.com/sagemathinc/cocalc-kubernetes#readme",
    link: (
      <span>
        Deploy a CoCalc server on your Kubernetes cluster (commercial support
        available)
      </span>
    ),
  },
};

export const CONNECT_LINKS : Links = {
  discord: {
    commercial: true,
    bold: true,
    icon: "discord",
    href: DISCORD_INVITE,
    link: (
      <span>
        Discord - chat about <SiteName />
      </span>
    ),
  },
  share: {
    icon: "bullhorn",
    href: join(BASE_URL, 'share'),
    link: "Shared public files",
  },
  support_mailing_list: {
    icon: "list-alt",
    href: "https://groups.google.com/forum/?fromgroups#!forum/cocalc",
    link: <span>Mailing list</span>,
  },
  sagemath_blog: {
    icon: "blog",
    href: "http://blog.sagemath.com/",
    link: "News and updates on our blog",
  },
  twitter: {
    icon: "twitter",
    href: `https://twitter.com/${TWITTER_HANDLE}`,
    link: `Follow @${TWITTER_HANDLE} on twitter`,
  },
  facebook: {
    icon: "facebook",
    href: "https://www.facebook.com/CoCalcOnline/",
    link: "Like our facebook page",
  },
  github: {
    icon: "github",
    href: "https://github.com/sagemathinc/cocalc",
    link: "GitHub",
    text: (
      <span>
        <a
          href="https://github.com/sagemathinc/cocalc/tree/master/src"
          target="_blank"
          rel="noopener"
        >
          source code
        </a>
        ,{" "}
        <a
          href="https://github.com/sagemathinc/cocalc/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aopen%20label%3AI-bug%20sort%3Acreated-asc%20-label%3Ablocked"
          target="_blank"
          rel="noopener"
        >
          bugs
        </a>
        {" and "}
        <a
          href="https://github.com/sagemathinc/cocalc/issues"
          target="_blank"
          rel="noopener"
        >
          issues
        </a>
      </span>
    ),
  },
};

export const THIRD_PARTY : Links = {
  sagemath: {
    icon: "sagemath",
    href: "http://www.sagemath.org/",
    link: "SageMath",
    text: <span>open-source mathematical software</span>,
  },
  r: {
    icon: "r",
    href: "https://cran.r-project.org/doc/manuals/r-release/R-intro.html",
    link: "R project",
    text: "the #1 open-source statistics software",
  },
  python: {
    icon: "python",
    href: "http://www.scipy-lectures.org/",
    link: "Scientific Python",
    text: (
      <span>
        i.e.{" "}
        <a
          href="http://statsmodels.sourceforge.net/stable/"
          target="_blank"
          rel="noopener"
        >
          Statsmodels
        </a>
        ,{" "}
        <a
          href="http://pandas.pydata.org/pandas-docs/stable/"
          target="_blank"
          rel="noopener"
        >
          Pandas
        </a>
        ,{" "}
        <a
          href="http://docs.sympy.org/latest/index.html"
          target="_blank"
          rel="noopener"
        >
          SymPy
        </a>
        ,{" "}
        <a
          href="http://scikit-learn.org/stable/documentation.html"
          target="_blank"
          rel="noopener"
        >
          Scikit Learn
        </a>
        ,{" "}
        <a href="http://www.nltk.org/" target="_blank" rel="noopener">
          NLTK
        </a>{" "}
        and many more
      </span>
    ),
  },
  julia: {
    icon: "julia",
    href: "https://www.julialang.org/",
    link: "Julia",
    text: "programming language for numerical computing",
  },
  octave: {
    icon: "octave",
    href: "https://www.gnu.org/software/octave/",
    link: "GNU Octave",
    text: "scientific programming language, largely compatible with MATLAB",
  },
  tensorflow: {
    icon: "lightbulb",
    href: "https://www.tensorflow.org/get_started/get_started",
    link: "Tensorflow",
    text: "open-source software library for machine intelligence",
  },
  latex: {
    icon: "tex-file",
    href: "https://en.wikibooks.org/wiki/LaTeX",
    link: "LaTeX",
    text: "high-quality typesetting program",
  },
  linux: {
    icon: "linux",
    href: "http://ryanstutorials.net/linuxtutorial/",
    link: "GNU/Linux",
    text: "operating system and utility toolbox",
  },
};

export const ABOUT_LINKS : Links = {
  legal: {
    icon: "files",
    link: "Terms of Service, Pricing, Copyright and Privacy policies",
    href: join(BASE_URL, "policies/index.html"),
  },
  developers: {
    icon: "keyboard",
    text: (
      <span>
        <a
          target="_blank"
          rel="noopener"
          href="http://blog.sagemath.com/cocalc/2018/09/10/where-is-cocalc-from.html"
        >
          Core developers
        </a>
        : John Jeng,{" "}
        <a target="_blank" rel="noopener" href="http://harald.schil.ly/">
          Harald Schilly
        </a>
        ,{" "}
        <a target="_blank" rel="noopener" href="https://twitter.com/haldroid">
          Hal Snyder
        </a>
        ,{" "}
        <a target="_blank" rel="noopener" href="http://wstein.org">
          William Stein
        </a>
      </span>
    ),
  },
  incorporated: {
    icon: "gavel",
    text:
      "SageMath, Inc. is a Delaware C Corporation that was incorporated Feb 2, 2015, founded on sustainable principles. The company has no plans to take Venture Capital funding or be acquired.",
  },
};
