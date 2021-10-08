import { r_join } from "@cocalc/frontend/components/r_join";
import A from "components/misc/A";

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
  help: { label: "Help" },
  connect: { label: "Connect" },
  status: { label: "Status" },
};

const sign_in = {
  "sign-in": { label: "Sign In", href: "/sign-in" },
  "password-reset": { label: "Password Reset", href: "/password-reset" },
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
};

export type Page = keyof typeof PAGES;
export type SubPage =
  | keyof typeof software
  | keyof typeof features
  | keyof typeof pricing
  | keyof typeof policies
  | keyof typeof info
  | keyof typeof sign_in;

interface Props {
  page: Page;
  subPage?: SubPage;
}

export default function SubNav({ page, subPage }: Props) {
  const tabs: JSX.Element[] = [];
  const p = PAGES[page];
  if (p == null) return null;
  for (const name in p) {
    if (p[name]?.disabled) continue;
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
