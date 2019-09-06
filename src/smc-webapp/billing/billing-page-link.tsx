import { React, Rendered } from "../app-framework";

const { load_target } = require("../history");

export function BillingPageLink(opts: { text?: string }): Rendered {
  let { text } = opts;
  if (!text) {
    text = "billing page";
  }
  return (
    <a
      onClick={() => load_target("settings/billing")}
      style={{ cursor: "pointer" }}
    >
      {text}
    </a>
  );
}
