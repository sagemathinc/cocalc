import React from "react";
import register from "./register";
import { Ansi, is_ansi as isAnsi } from "../ansi";
import { STDOUT_STYLE } from "../style";
import { TextPlain } from "../text-plain";

register("text/plain", ({ data, value, actions }) => {
  if (data.has("application/vnd.jupyter.widget-view+json") && actions != null) {
    // TODO: this is pretty dumb for now, but it'll do *temporarily*...
    // used for history, and maybe share server.  Obviously, we want
    // as much to be "alive" as possible at some point!
    return null;
  }
  if (isAnsi(value)) {
    return (
      <div style={STDOUT_STYLE}>
        <Ansi>{value}</Ansi>
      </div>
    );
  }
  return <TextPlain value={value} />;
});
