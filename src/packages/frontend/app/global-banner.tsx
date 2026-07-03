/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Non-dismissable notice at the very top of the app, showing the
// admin-configured sign-in banner message – e.g., for announcing that
// this server is shutting down and users have to migrate elsewhere.
// Rendered only if the banner is enabled and the message is set.

import { Alert } from "antd";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

export default function GlobalBanner() {
  const enabled = useTypedRedux("customize", "sign_in_banner_enabled");
  const message = useTypedRedux("customize", "sign_in_banner_message");
  const url = useTypedRedux("customize", "sign_in_banner_url");
  const linkText = useTypedRedux("customize", "sign_in_banner_link_text");

  if (!enabled || !message?.trim()) {
    return null;
  }

  const href = url?.trim();

  return (
    <Alert
      banner
      type="error"
      showIcon
      message={
        <div style={{ textAlign: "center" }}>
          <StaticMarkdown
            value={message}
            style={{ display: "inline-block", width: "auto" }}
          />
          {href && (
            <A href={href} style={{ marginLeft: "10px" }}>
              <b>{linkText?.trim() || "Continue"}</b>
            </A>
          )}
        </div>
      }
    />
  );
}
