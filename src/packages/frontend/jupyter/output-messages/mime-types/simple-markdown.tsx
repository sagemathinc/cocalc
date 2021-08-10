import React from "react";
import register from "./register";
import Markdown from "@cocalc/frontend/markdown/component";

register("text/markdown", ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <Markdown value={value} />
    </div>
  );
});
