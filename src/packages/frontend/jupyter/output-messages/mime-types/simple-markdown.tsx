import React from "react";
import register from "./register";
import Markdown from "@cocalc/frontend/markdown/component";

register("text/markdown", 4, ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <Markdown value={value} />
    </div>
  );
});
