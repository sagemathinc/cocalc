/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { useIntl } from "react-intl";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import { alert_message } from "@cocalc/frontend/alerts";
import { useIsMountedRef } from "@cocalc/frontend/app-framework";
import {
  A,
  Icon,
  Paragraph,
  SettingBox,
  Text,
} from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  project_id: string;
  mode?: "project" | "flyout";
}

export const SagewsControl: React.FC<Props> = (props: Props) => {
  const { project_id, mode = "project" } = props;
  const isFlyout = mode === "flyout";
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const isMounted = useIsMountedRef();

  async function restart_worksheet() {
    setLoading(true);
    setError(undefined);
    try {
      const ret = await webapp_client.project_client.exec({
        project_id,
        command: "smc-sage-server stop; sleep 1; smc-sage-server start",
        timeout: 30,
      });
      if (!isMounted) return;
      if (ret?.stderr) throw new Error(ret.stderr);
      alert_message({
        type: "info",
        message:
          "Worksheet server restarted. Restarted worksheets will use a new Sage session.",
      });
    } catch (err) {
      if (!isMounted) return;
      setError(err.toString());
      alert_message({
        type: "error",
        message:
          `Error trying to restart worksheet server. Try restarting the entire ${projectLabelLower} instead.`,
      });
    }
    if (isMounted) {
      // see https://github.com/sagemathinc/cocalc/issues/1684
      setLoading(false);
    }
  }

  function renderBody() {
    return (
      <>
        <Paragraph>
          This restarts the underlying{" "}
          <A href={"https://doc.cocalc.com/sagews.html"}>Sage Worksheet</A>{" "}
          server. In case you customized your <Text code>$HOME/bin/sage</Text>,
          you have to do this, in order to to pick up the new version of Sage.
        </Paragraph>
        <Paragraph style={{ color: COLORS.GRAY_D }}>
          Existing worksheet sessions are unaffected. This means you have to
          restart your worksheet as well to use the new version of Sage.
        </Paragraph>
        <Paragraph style={{ textAlign: "center" }}>
          <Button
            bsStyle="warning"
            disabled={loading}
            onClick={restart_worksheet}
          >
            <Icon name="refresh" spin={loading} /> Restart SageWS Server
          </Button>
        </Paragraph>
        {error && <Text type="danger">{error}</Text>}
      </>
    );
  }

  const title = "Restart Sage Worksheet Server";

  if (isFlyout) {
    return (
      <>
        <Paragraph style={{ fontWeight: "bold" }}>
          <Icon name="refresh" /> {title}
        </Paragraph>
        {renderBody()}
      </>
    );
  } else {
    return (
      <SettingBox title={title} icon="refresh">
        {renderBody()}
      </SettingBox>
    );
  }
};
