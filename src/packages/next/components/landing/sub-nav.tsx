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
  sage: { label: "SageMath", disabled: true },
  octave: { label: "Octave" },
  julia: { label: "Julia", disabled: true },
  teaching: { label: "Teaching" },
  terminal: { label: "Terminal" },
  x11: { label: "X11" },
  compare: { label: "Compare" },
  api: { label: "API" },
};

const billing = {
  pricing: { lable: "Pricing" },
};

const policies = {
  terms_of_service: { label: "Terms of service" },
  copyright: { label: "Copyright" },
  privacy: { label: "Privacy" },
  thirdparties: { label: "Third parties" },
  ferpa: { label: "FERPA compliance" },
};

const PAGES = {
  features,
  software,
  billing,
  policies,
};

export type Page = keyof typeof PAGES;
export type SubPage =
  | keyof typeof software
  | keyof typeof features
  | keyof typeof billing
  | keyof typeof policies;

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
        selected={subPage == name}
        name={name}
        label={p[name].label}
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

function SubPageTab({ name, selected, label }) {
  return (
    <A
      href={`/doc/${name}`}
      style={
        selected ? { fontWeight: "bold", color: "blue" } : { color: "#555" }
      }
    >
      {label}
    </A>
  );
}
