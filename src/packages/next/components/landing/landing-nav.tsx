import { r_join } from "@cocalc/frontend/components/r_join";
import A from "components/misc/A";

const PAGES = {
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

export type LandingPageName = keyof typeof PAGES;

interface Props {
  landing?: LandingPageName;
}

export default function LandingNav({ landing }: Props) {
  const tabs: JSX.Element[] = [];
  for (const name in PAGES) {
    if (PAGES[name]?.disabled) continue;
    tabs.push(<LandingTab key={name} selected={landing == name} name={name} />);
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

function LandingTab({ name, selected }) {
  return (
    <A
      href={`/doc/${name}`}
      style={
        selected ? { fontWeight: "bold", color: "blue" } : { color: "#555" }
      }
    >
      {PAGES[name]?.label}
    </A>
  );
}
