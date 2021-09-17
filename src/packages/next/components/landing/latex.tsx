import React from "react";
import mathToHtml from "@cocalc/frontend/misc/math-to-html";

const LaTeX = React.memo(() => {
  const { __html } = mathToHtml("\\LaTeX", true);
  return <span dangerouslySetInnerHTML={{ __html }}></span>;
});

export default LaTeX;
