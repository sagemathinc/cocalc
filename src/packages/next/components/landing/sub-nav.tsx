/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Divider } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { r_join } from "@cocalc/frontend/components/r_join";
import { COLORS } from "@cocalc/util/theme";
import A from "components/misc/A";
import { useCustomize } from "lib/customize";
import {
  SoftwareEnvNames,
  SOFTWARE_ENV_DEFAULT,
  SOFTWARE_ENV_NAMES,
} from "lib/landing/consts";

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
  whiteboard: { label: "Whiteboard" },
  "latex-editor": { label: "LaTeX" },
  linux: { label: "Linux" },
  python: { label: "Python" },
  "r-statistical-software": { label: "R Stats" },
  sage: { label: "SageMath" },
  octave: { label: "Octave" },
  julia: { label: "Julia" },
  teaching: { label: "Teaching" },
  terminal: { label: "Terminal" },
  x11: { label: "X11" },
  compare: { label: "Compare" },
  api: { label: "API" },
} as const;

const pricing = {
  index: {},
  products: { label: "Products" },
  subscriptions: { label: "Subscriptions" },
  courses: { label: "Courses" },
  dedicated: { label: "Dedicated" },
  onprem: { label: "OnPrem" },
} as const;

const policies = {
  index: {},
  terms: { label: "Terms of Service", hide: (c) => !c.onCoCalcCom },
  copyright: { label: "Copyright", hide: (c) => !c.onCoCalcCom },
  privacy: { label: "Privacy", hide: (c) => !c.onCoCalcCom },
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

const sign_in = {
  "sign-in": { label: "Sign In", href: "/auth/sign-in" },
  "password-reset": { label: "Password Reset", href: "/auth/password-reset" },
} as const;

const support = {
  index: {},
  community: { label: "Community" },
  new: { label: "New Ticket", hide: (customize) => !customize.zendesk },
  tickets: { label: "Tickets", hide: (customize) => !customize.zendesk },
} as const;

const PAGES = {
  features,
  software,
  pricing,
  policies,
  share: {},
  info,
  "sign-up": {},
  "sign-in": sign_in,
  try: {},
  support,
  store: {},
} as const;

export type Page = keyof typeof PAGES | "account";
export type SubPage =
  | keyof typeof software
  | keyof typeof features
  | keyof typeof pricing
  | keyof typeof policies
  | keyof typeof info
  | keyof typeof sign_in
  | keyof typeof support;

interface Props {
  page: Page;
  subPage?: SubPage;
  softwareEnv?: SoftwareEnvNames;
}

const SEP = <div style={{ width: "16px", display: "inline-block" }} />;

export default function SubNav(props: Props) {
  const { page, subPage, softwareEnv } = props;
  const customize = useCustomize();
  const tabs: JSX.Element[] = [];
  const p = PAGES[page];
  if (p == null) return null;

  function renderSoftwareEnvs() {
    const links = SOFTWARE_ENV_NAMES.map((name) => {
      const selected = name === softwareEnv;
      const style =
        SOFTWARE_ENV_DEFAULT === name ? { fontWeight: "bold" } : undefined;
      return (
        <A
          key={name}
          style={{ ...tabStyle(selected), ...style }}
          href={`/software/executables/${name}`}
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
      />
    );
  }
  return (
    <div
      style={{
        backgroundColor: "white",
        textAlign: "center",
        color: COLORS.GRAY,
        padding: "15px",
        lineHeight: "2rem",
      }}
    >
      {r_join(tabs, SEP)}
      {page == "software" && renderSoftwareEnvs()}
    </div>
  );
}

interface SubPageTabProps {
  href?: string;
  label: JSX.Element;
  name: string;
  page: string;
  selected: boolean;
  softwareEnv?: SoftwareEnvNames;
}

function SubPageTab(props: SubPageTabProps) {
  const { page, name, selected, label, href, softwareEnv } = props;

  // those software subpages also need the image name as the subpage
  const suffix =
    page === "software" ? `/${softwareEnv ?? SOFTWARE_ENV_DEFAULT}` : "";

  const url = href ?? `/${page}/${name}${suffix}`;

  return (
    <A href={url} style={tabStyle(selected)}>
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
