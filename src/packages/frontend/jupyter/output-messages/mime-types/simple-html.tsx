import React from "react";
import register from "./register";
import HTML from "@cocalc/frontend/r_misc/html-ssr";

const Html = ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <HTML value={value} />
    </div>
  );
};

register("text/html", Html);

// put latex as HTML, since jupyter requires $'s anyways:
register("text/latex", Html);
