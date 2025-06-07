/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components";
import { SiteName } from "@cocalc/frontend/customize";
import { get_browser } from "@cocalc/frontend/feature";
import { type CSSProperties } from "react";

const WARNING_STYLE = {
  position: "fixed",
  left: 12,
  backgroundColor: "red",
  color: "#fff",
  top: 20,
  opacity: 0.9,
  borderRadius: 4,
  padding: 5,
  marginTop: "1em",
  zIndex: 100000,
  boxShadow: "8px 8px 4px #888",
  width: "70%",
} as CSSProperties;

export function CookieWarning() {
  return (
    <div style={WARNING_STYLE}>
      <Icon name="warning" /> You <em>must</em> enable cookies to use{" "}
      <SiteName />.
    </div>
  );
}

const STORAGE_WARNING_STYLE = {
  ...WARNING_STYLE,
  top: 55,
} as CSSProperties;

export function LocalStorageWarning() {
  return (
    <div style={STORAGE_WARNING_STYLE}>
      <Icon name="warning" /> You <em>must</em> enable local storage to use{" "}
      <SiteName />
      {get_browser() === "safari"
        ? " (on Safari you must disable private browsing mode)"
        : undefined}
      .
    </div>
  );
}
