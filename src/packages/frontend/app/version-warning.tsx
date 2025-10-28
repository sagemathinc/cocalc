/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Gap, Icon } from "@cocalc/frontend/components";
import { type CSSProperties, useEffect, useState } from "react";
import { version } from "@cocalc/util/smc-version";
import { webapp_client } from "@cocalc/frontend/webapp-client";

const VERSION_WARNING_STYLE: CSSProperties = {
  fontSize: "12pt",
  position: "fixed",
  left: 12,
  backgroundColor: "#fcf8e3",
  color: "#8a6d3b",
  top: 20,
  borderRadius: 4,
  padding: "15px",
  zIndex: 900,
  boxShadow: "8px 8px 4px #888",
  width: "70%",
  marginTop: "1em",
} as const;

export default function VersionWarning() {
  const [closed, setClosed] = useState<boolean>(false);
  const minVersion = useTypedRedux("customize", "version_min_browser");
  const recommendedVersion = useTypedRedux(
    "customize",
    "version_recommended_browser",
  );

  useEffect(() => {
    if (minVersion > version) {
      // immediately and permanently disconnect user from conat
      webapp_client.conat_client.permanentlyDisconnect();
    }
  }, [minVersion]);

  if (version >= recommendedVersion) {
    return null;
  }

  if (version >= minVersion && closed) {
    return null;
  }

  const style = {
    ...VERSION_WARNING_STYLE,
    ...(version < minVersion
      ? { backgroundColor: "red", color: "#fff" }
      : undefined),
  };

  function render_critical() {
    if (version >= minVersion) {
      return;
    }
    return (
      <div>
        <br />
        THIS IS A CRITICAL UPDATE. YOU MUST <Gap />
        <a
          onClick={() => window.location.reload()}
          style={{
            cursor: "pointer",
            color: "white",
            fontWeight: "bold",
            textDecoration: "underline",
          }}
        >
          REFRESH THIS PAGE
        </a>
        <Gap /> IMMEDIATELY. Sorry for the inconvenience.
      </div>
    );
  }

  function render_suggested() {
    return (
      <>
        <Icon name={"refresh"} /> New Version Available: upgrade by <Gap />
        <a
          onClick={() => window.location.reload()}
          style={{
            cursor: "pointer",
            fontWeight: "bold",
            color: style.color,
            textDecoration: "underline",
          }}
        >
          reloading this page
        </a>
        .{render_close()}
      </>
    );
  }

  function render_close() {
    if (version >= minVersion) {
      return (
        <Icon
          name="times"
          className="pull-right"
          style={{ cursor: "pointer", marginTop: "5px" }}
          onClick={() => setClosed(true)}
        />
      );
    }
  }

  return (
    <div style={style}>
      {render_suggested()}
      {render_critical()}
    </div>
  );
}
