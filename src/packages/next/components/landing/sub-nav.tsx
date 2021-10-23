import { r_join } from "@cocalc/frontend/components/r_join";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { useCustomize } from "lib/customize";

const software = {
  executables: { label: "Executables" },
  python: { label: "Python" },
  r: { label: "R Stats" },
  julia: { label: "Julia" },
  octave: { label: "Octave" },
};

const features = {
  "jupyter-notebook": { label: "Jupyter" },
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
  products: { label: "Products" },
  subscriptions: { label: "Subscriptions" },
  courses: { label: "Courses" },
  dedicated: { label: "Dedicated VM's" },
  onprem: { label: "OnPrem" },
};

const policies = {
  terms: { label: "Terms of Service" },
  copyright: { label: "Copyright" },
  privacy: { label: "Privacy" },
  thirdparties: { label: "Third Parties" },
  ferpa: { label: "FERPA" },
  accessibility: { label: "Accessibility" },
};

const info = {
  doc: { label: "Documentation" },
  status: { label: "Status" },
  run: { label: "Run CoCalc" },
};

const sign_in = {
  "sign-in": { label: "Sign In", href: "/auth/sign-in" },
  "password-reset": { label: "Password Reset", href: "/auth/password-reset" },
};

const support = {
  community: { label: "Community" },
  create: { label: "Create Ticket", hide: (customize) => !customize.zendesk },
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

export type Page = keyof typeof PAGES;
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
  const tabs: JSX.Element[] = [
    <SubPageTab
      key={"index"}
      page={page}
      selected={!subPage}
      name={"index"}
      label={<Icon name="home" />}
      href={`/${page}`}
    />,
  ];
  const p = PAGES[page];
  if (p == null) return null;
  for (const name in p) {
    if (p[name]?.disabled) continue;
    if (p[name]?.hide?.(customize)) continue;
    tabs.push(
      <SubPageTab
        key={name}
        page={page}
        selected={subPage == name}
        name={name}
        label={p[name].label}
        href={p[name].href}
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
