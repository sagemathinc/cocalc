import React from "react";
import register from "./register";
import { IFrame } from "../iframe";

register("iframe", 7, ({ project_id, value }) => {
  if (value == null || project_id == null) {
    return <pre>iframe must specify project_id and sha1</pre>;
  }
  return <IFrame sha1={value} project_id={project_id} />;
});
