/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { r_join } from "@cocalc/frontend/components/r_join";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { useCustomize } from "lib/customize";

const software = {
  index: {},
  executables: { label: "Executables" },
  python: { label: "Python" },
  r: { label: "R Stats" },
  julia: { label: "Julia" },
  octave: { label: "Octave" },
};

const features = {
  index: {},
  "jupyter-notebook": { label: "Jupyter" },
  "whiteboard": {label: "Whiteboard"},
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
};

const pricing = {
  index: {},
  products: { label: "Products" },
  subscriptions: { label: "Subscriptions" },
  courses: { label: "Courses" },
  dedicated: { label: "Dedicated" },
  onprem: { label: "OnPrem" },
};

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
};

const info = {
  index: {},
  doc: { label: "Documentation" },
  status: { label: "Status" },
  run: { label: "Run CoCalc" },
};

const sign_in = {
  "sign-in": { label: "Sign In", href: "/auth/sign-in" },
  "password-reset": { label: "Password Reset", href: "/auth/password-reset" },
};

const support = {
  index: {},
  community: { label: "Community" },
  new: { label: "New Ticket", hide: (customize) => !customize.zendesk },
  tickets: { label: "Tickets", hide: (customize) => !customize.zendesk },
};

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
};

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
}

export default function SubNav({ page, subPage }: Props) {
  const customize = useCustomize();
  const tabs: JSX.Element[] = [];
  const p = PAGES[page];
  if (p == null) return null;
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
        key={name}
        page={page}
        selected={selected}
        name={name}
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
        color: "#666",
        padding: "15px 0",
      }}
    >
      {r_join(tabs, <div style={{ width: "16px", display: "inline-block" }} />)}
    </div>
  );
}

function SubPageTab({ page, name, selected, label, href }) {
  return (
    <A
      href={href ?? `/${page}/${name}`}
      style={
        selected
          ? {
              fontWeight: "bold",
              color: "blue",
              paddingBottom: "3px",
              borderBottom: "3px solid blue",
            }
          : { color: "#555" }
      }
    >
      {label}
    </A>
  );
}
