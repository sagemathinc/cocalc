/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Modal } from "antd";
import { FormattedMessage, useIntl } from "react-intl";
import { Button, Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { ConnectionStatsDisplay } from "./connection-status";

export const ConnectionInfo: React.FC = React.memo(() => {
  const intl = useIntl();

  const ping = useTypedRedux("page", "ping");
  const avgping = useTypedRedux("page", "avgping");
  const status = useTypedRedux("page", "connection_status");
  const page_actions = useActions("page");
  const conat = useTypedRedux("page", "conat");
  const hub = useTypedRedux("account", "hub");

  function close() {
    page_actions.show_connection(false);
  }

  return (
    <Modal
      width={700}
      open
      onCancel={close}
      onOk={close}
      title={
        <div
          style={{ display: "flex", alignItems: "center", marginRight: "30px" }}
        >
          <Icon name="wifi" style={{ marginRight: "1em" }} />{" "}
          {intl.formatMessage(labels.connection)}
          <div style={{ flex: 1 }} />
          <Button
            onClick={() => {
              webapp_client.conat_client.reconnect();
            }}
          >
            <Icon name="repeat" spin={status === "connecting"} />{" "}
            {intl.formatMessage(labels.reconnect)}
          </Button>
        </div>
      }
    >
      <div>
        {conat != null && (
          <Row>
            <Col sm={12}>
              {conat && (
                <ConnectionStatsDisplay status={conat.toJS()} hub={hub} />
              )}
            </Col>
          </Row>
        )}
        {ping ? (
          <Row style={{ marginTop: "30px" }}>
            <Col sm={3}>
              <h5>
                <FormattedMessage
                  id="connection-info.ping"
                  defaultMessage="Ping Time"
                  description={"Ping how long a server takes to respond"}
                />
              </h5>
            </Col>
            <Col sm={7}>
              <pre>
                <FormattedMessage
                  id="connection-info.ping_info"
                  defaultMessage="{avgping}ms (latest: {ping}ms)"
                  description={
                    "Short string stating the average and the most recent ping in milliseconds."
                  }
                  values={{ avgping, ping }}
                />
              </pre>
            </Col>
          </Row>
        ) : undefined}
      </div>
    </Modal>
  );
});
