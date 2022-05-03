import React from "react";

export default function HeadingTagComponent({
  id,
  level,
  children,
  attributes,
}) {
  let hash = "";
  for (const child of children ?? []) {
    hash += (child.props?.element?.text ?? "").replace(/\s/g, "-");
  }
  return React.createElement(
    `h${level}`,
    { id, ...attributes, className: "cocalc-jupyter-header" },
    (children ?? []).concat(
      <a
        key="jupyter-anchor"
        className="cocalc-jupyter-anchor-link"
        href={`#${hash}`}
      >
        ¶
      </a>
    )
  );
}
