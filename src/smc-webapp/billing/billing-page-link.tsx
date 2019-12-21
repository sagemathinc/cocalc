import { React, Rendered } from "../app-framework";

const { load_target } = require("../history");

export function BillingPageLink(opts: { text?: string }): Rendered {
  let { text } = opts;
  if (!text) {
    text = "billing page";
  }
  return (
    <a onClick={visit_billing_page} style={{ cursor: "pointer" }}>
      {text}
    </a>
  );
}

export function visit_billing_page(): void {
  load_target("settings/billing");
}
