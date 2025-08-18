import register from "./register";
import HTML from "@cocalc/frontend/components/html-ssr";
import StableUnsafeHtml from "../stable-unsafe-html";

export default function Html({
  value,
  id,
  index,
  trust,
}: {
  value: string;
  id?: string;
  index?: number;
  trust?: boolean;
}) {
  // if id and index aren't set no way to track this as stable unsafe html.
  // This happens, e.g., right now with renderOutput with ipywidgets, which is probably OK, since usually
  // with widgets the HTML doesn't need to be stable -- you are using widgets for state, not HTML.
  if (
    id == null ||
    index == null ||
    !trust ||
    !requiresStableUnsafeHtml(value)
  ) {
    return <HTML value={value} />;
  }
  return (
    <div style={{ margin: "5px 0" }}>
      <StableUnsafeHtml
        html={`<div class="cocalc-jupyter-rendered">${value}</div>`}
        docId={`${id}-${index}`}
      />
    </div>
  );
}

// HTML should definitely have higher priority than
// LaTeX.  For example, Julia tables are output as both
// **backend only** text/latex and as text/html
// that looks good and is meant to be rendered on the frontend.
// See https://github.com/sagemathinc/cocalc/issues/5925
// But Latex should have higher priority than HTML, e.g.,
// sage show(...) is much better to just render using latex!
// SIGH.
register("text/html", 5, Html);

// Heuristics to only use plain stateless html.
function requiresStableUnsafeHtml(value: string) {
  if (!value) {
    return false;
  }
  if (value.includes(".bk-notebook-logo")) {
    // bokeh -- needs state
    return true;
  }
  if (value.includes(`class="dataframe"`)) {
    // pandas
    return false;
  }
  // default for now
  return true;
}
