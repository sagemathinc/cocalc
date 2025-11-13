/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Divider } from "antd";
import { isEmpty } from "lodash";
import { useEffect, useRef, useState, type JSX } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { r_join } from "@cocalc/frontend/components/r_join";
import {
  SOFTWARE_ENV_DEFAULT,
  SOFTWARE_ENV_NAMES,
  SoftwareEnvNames,
} from "@cocalc/util/consts/software-envs";
import { COLORS } from "@cocalc/util/theme";
import Logo from "components/logo";
import { CSS } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH_LANDING } from "lib/config";
import { CustomizeType, useCustomize } from "lib/customize";

const BASE_STYLE: CSS = {
  backgroundColor: "white",
  textAlign: "center",
  paddingLeft: "45px",
  paddingRight: "45px",
  paddingTop: "10px",
  paddingBottom: "10px",
  width: "100%",
  zIndex: 1,
  lineHeight: "2rem", // important to increase line height for narrow screens, otherwise text+underline is rendered on top of each other
  maxHeight: "5rem",
  overflow: "hidden",
};

const FLOAT_STYLE: CSS = {
  ...BASE_STYLE,
  position: "fixed",
  paddingBottom: "5px",
  paddingRight: 0,
  paddingLeft: 0,
  top: "0",
  boxShadow: "0 4px 6px 0 rgba(0.1,0.1,0.1,0.20)",
} as const;

const INNER_STYLE: CSS = {
  maxWidth: MAX_WIDTH_LANDING,
  margin: "0 auto",
  overflow: "auto",
  whiteSpace: "nowrap",
};

const about = {
  index: {},
  events: { label: "Events" },
  team: { label: "Team" },
} as const;

const software = {
  index: {},
  executables: { label: "Executables" },
  python: { label: "Python" },
  r: { label: "R Stats" },
  julia: { label: "Julia" },
  octave: { label: "Octave" },
  sagemath: { label: "SageMath" },
} as const;

const features = {
  index: {},
  "jupyter-notebook": { label: "Jupyter" },
  julia: { label: "Julia" },
  "latex-editor": { label: "LaTeX" },
  linux: { label: "Linux" },
  octave: { label: "Octave" },
  python: { label: "Python" },
  "r-statistical-software": { label: "R Stats" },
  sage: { label: "SageMath" },
  slides: { label: "Slides" },
  teaching: { label: "Teaching" },
  terminal: { label: "Terminal" },
  whiteboard: { label: "Whiteboard" },
  x11: { label: "X11" },
  div1: { type: "divider" },
  "compute-server": { label: "Compute" },
  ai: { label: "AI Assistant" },
  compare: { label: "Compare" },
  api: { label: "API" },
} as const;

const pricing = {
  index: {},
  products: { label: "Products" },
  subscriptions: { label: "Subscriptions" },
  courses: { label: "Courses" },
  institutions: { label: "Institutions" },
  onprem: { label: "OnPrem" },
  dedicated: { label: "Dedicated" },
} as const;

export const POLICIES = {
  index: {},
  terms: { label: "Terms of Service", hide: (c) => !c.onCoCalcCom },
  copyright: { label: "Copyright", hide: (c) => !c.onCoCalcCom },
  privacy: { label: "Privacy", hide: (c) => !c.onCoCalcCom },
  trust: { label: "Trust", hide: (c) => !c.onCoCalcCom },
  thirdparties: { label: "Third Parties", hide: (c) => !c.onCoCalcCom },
  ferpa: { label: "FERPA", hide: (c) => !c.onCoCalcCom },
  accessibility: { label: "Accessibility", hide: (c) => !c.onCoCalcCom },
  imprint: { label: "Imprint", hide: (c) => !c.imprint },
  policies: { label: "Policies", hide: (c) => !c.policies },
} as const;

const info = {
  index: {},
  doc: { label: "Documentation" },
  status: { label: "Status" },
  run: { label: "Run CoCalc" },
} as const;

const support = {
  index: {},
  community: { label: "Community" },
  new: { label: "New Ticket", hide: (customize) => !customize.zendesk },
  tickets: { label: "Tickets", hide: (customize) => !customize.zendesk },
  chatgpt: {
    label: "AI",
    hide: (customize) => !customize.openaiEnabled || !customize.onCoCalcCom,
  },
} as const;

type PageKey =
  | "about"
  | "features"
  | "software"
  | "pricing"
  | "policies"
  | "share"
  | "info"
  | "sign-up"
  | "sign-in"
  | "try"
  | "support"
  | "news"
  | "store";

const PAGES: {
  [top in PageKey]:
    | {
        [page: string]: { label: string; hide?: (c: CustomizeType) => boolean };
      }
    | { index: {} };
} = {
  about,
  features,
  software,
  pricing,
  policies: POLICIES,
  share: {},
  info,
  "sign-up": {},
  "sign-in": {},
  try: {},
  support,
  news: {},
  store: {},
} as const;

export type Page = PageKey | "account";
export type SubPage =
  | keyof typeof software
  | keyof typeof features
  | keyof typeof pricing
  | keyof typeof POLICIES
  | keyof typeof info
  | keyof typeof support
  | keyof typeof about;

interface Props {
  page?: Page;
  subPage?: SubPage;
  softwareEnv?: SoftwareEnvNames;
}

const SEP = <div style={{ width: "16px", display: "inline-block" }} />;

export default function SubNav(props: Props) {
  const { page, subPage, softwareEnv } = props;
  const customize = useCustomize();

  const [floating, setFloating] = useState(false);
  const subnavRef = useRef<HTMLDivElement>(null);

  // a hook tracking the vertical scroll position.
  useEffect(() => {
    const subnav = subnavRef.current;
    if (subnav == null) return;
    const onScroll = () => {
      const offset = subnav.getBoundingClientRect().top;
      setFloating(offset < 0);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [subnavRef]);

  if (page == null) return null;

  // if we define a custom support page, render it instead – and hide the sub menu
  if (customize.support && !customize.onCoCalcCom) return null;

  const tabs: JSX.Element[] = [];
  const p = PAGES[page];
  if (p == null || isEmpty(p)) return null;

  function renderSoftwareEnvs() {
    if (page != "software") return;

    const links = SOFTWARE_ENV_NAMES.map((name) => {
      const selected = name === softwareEnv;
      const style =
        SOFTWARE_ENV_DEFAULT === name ? { fontWeight: "bold" } : undefined;
      // clicking on the software env link should not switch between subpages
      const sub =
        subPage != null && software[subPage] != null ? subPage : "executables";
      return (
        <A
          key={name}
          style={{ ...tabStyle(selected), ...style }}
          href={`/software/${sub}/${name}`}
        >
          {name}
        </A>
      );
    });
    return (
      <>
        {SEP}
        <Divider type="vertical" style={{ borderColor: COLORS.GRAY_D }} />
        {SEP}
        <span style={{ marginRight: "15px" }}>Ubuntu</span>
        {r_join(links, SEP)}
      </>
    );
  }

  for (const name in p) {
    if (p[name]?.disabled) continue;
    if (p[name]?.hide?.(customize)) continue;

    if (p[name].type === "divider") {
      tabs.push(
        <Divider
          key={name}
          type="vertical"
          style={{
            borderColor: COLORS.GRAY_D,
          }}
        />,
      );
      continue; // this is a divider, not a tab to click on
    }

    let { label, href, icon } = p[name];
    if (name == "index") {
      if (!href) href = `/${page}`;
      if (!icon) icon = "home";
    }
    const selected = name == "index" ? !subPage : subPage == name;
    tabs.push(
      <SubPageTab
        key={`${name}${subPage ?? ""}${softwareEnv ?? ""}`}
        page={page}
        selected={selected}
        name={name}
        softwareEnv={softwareEnv}
        style={{ marginRight: "5px", marginLeft: "5px" }}
        label={
          <>
            {icon && (
              <>
                <Icon name={icon} />
                {label ? " " : ""}
              </>
            )}
            {label}
          </>
        }
        href={href}
      />,
    );
  }

  const links = (
    <>
      {tabs}
      {renderSoftwareEnvs()}
    </>
  );

  function renderFloating() {
    return (
      <div
        style={{
          ...FLOAT_STYLE,
          ...{ paddingLeft: "0px" },
          ...{ display: floating ? "block" : "none" }, // we always render it, to make sure the logo has been loaded (no flickering)
        }}
      >
        <div style={INNER_STYLE}>
          <A
            href={"/"}
            style={{
              display: "inline-block",
              float: "left",
              position: "relative",
              marginLeft: "10px",
              marginRight: "5px",
            }}
          >
            <Logo
              type="icon"
              style={{
                height: "30px",
                width: "30px",
              }}
            />
          </A>
          <A
            onClick={() => window.scrollTo(0, 0)}
            style={{
              display: "inline-block",
              float: "right",
              position: "relative",
              marginLeft: "5px",
              marginRight: "10px",
            }}
          >
            <Icon
              name="arrow-circle-up"
              style={{
                color: COLORS.GRAY_D,
                fontSize: "30px",
              }}
            />
          </A>
          {links}
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={subnavRef} style={BASE_STYLE}>
        <div style={INNER_STYLE}>{links}</div>
      </div>
      {renderFloating()}
    </>
  );
}

interface SubPageTabProps {
  href?: string;
  label: JSX.Element;
  name: string;
  page: string;
  selected: boolean;
  softwareEnv?: SoftwareEnvNames;
  style?: CSS;
}

function SubPageTab(props: SubPageTabProps) {
  const { page, name, selected, label, href, softwareEnv, style } = props;

  // those software subpages also need the image name as the subpage
  const suffix =
    page === "software" ? `/${softwareEnv ?? SOFTWARE_ENV_DEFAULT}` : "";

  const url = href ?? `/${page}/${name}${suffix}`;

  return (
    <A href={url} style={{ ...tabStyle(selected), ...style }}>
      {label}
    </A>
  );
}

function tabStyle(selected: boolean): React.CSSProperties {
  return selected
    ? {
        fontWeight: "bold",
        color: "blue",
        paddingBottom: "3px",
        borderBottom: "3px solid blue",
      }
    : { color: COLORS.GRAY_D };
}
