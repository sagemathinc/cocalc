/*
This is a special version of the header component that is used in markdown for Jupyter
notebooks.  Our slate static renderer uses this instead of its normal one due to context.
The difference is that it (somewhat) uses the Jupyter classic approach to anchor URI fragments.
*/

import { createElement } from "react";

export default function HeadingTagComponent({
  id,
  level,
  children,
  attributes,
}) {
  const v: { text?: string; value?: string }[] = [];
  for (const child of children ?? []) {
    if (child?.props?.element != null) {
      v.push(child?.props?.element);
    }
  }
  const fragmentId = toFragmentId(v);
  return createElement(
    `h${level}`,
    { id, ...attributes, className: "cocalc-jupyter-header" },
    (children ?? []).concat(
      <a
        key="jupyter-anchor"
        className="cocalc-jupyter-anchor-link"
        href={`#${fragmentId}`}
      >
        ¶
      </a>
    )
  );
}

// Just replaces each whitespace character with a dash.
// This is designed to be reasonably consistent with Jupyter classic.
export function toFragmentId(children: { text?: string; value?: string }[]): string {
  let fragmentId = "";
  for (const { text, value } of children) {
    fragmentId += text ?? (value ? "$" + value + "$" : "");
  }
  return fragmentId.replace(/\s/g, "-");
}
