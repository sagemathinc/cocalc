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
import { COLORS } from "@cocalc/util/theme";

export const ConnectionInfo: React.FC = React.memo(() => {
  const intl = useIntl();

  const ping = useTypedRedux("page", "ping");
  const avgping = useTypedRedux("page", "avgping");
  const status = useTypedRedux("page", "connection_status");
  const hub = useTypedRedux("account", "hub");
  const page_actions = useActions("page");
  const nats = useTypedRedux("page", "nats");

  function close() {
    page_actions.show_connection(false);
  }

  return (
    <Modal
      width={900}
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
          <Button onClick={webapp_client.hub_client.fix_connection}>
            <Icon name="repeat" spin={status === "connecting"} />{" "}
            {intl.formatMessage(labels.reconnect)}
          </Button>
        </div>
      }
    >
      <div>
        {ping ? (
          <Row>
            <Col sm={3}>
              <h4>
                <FormattedMessage
                  id="connection-info.ping"
                  defaultMessage="Ping time"
                  description={"Ping how long a server takes to respond"}
                />
              </h4>
            </Col>
            <Col sm={6}>
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
        <Row>
          <Col sm={3}>
            <h4>NATS.io client</h4>
          </Col>
          {nats != null && (
            <Col sm={8}>
              <pre>
                {JSON.stringify(nats.toJS(), undefined, 2)
                  .replace(/{|}|,|\"/g, "")
                  .trim()
                  .replace("  data:", "data:")}
              </pre>
            </Col>
          )}
        </Row>
        <Row>
          <Col sm={3}>
            <h4>
              <FormattedMessage
                id="connection-info.hub_server"
                defaultMessage="Hub"
                description={"Ping how long a server takes to respond"}
              />
            </h4>
          </Col>
          <Col sm={6}>
            <pre>{hub != null ? hub : "Not signed in"}</pre>
          </Col>
        </Row>
        <Row>
          <Col sm={3}>
            <h4>
              Hub {intl.formatMessage(labels.message_plural, { num: 10 })}
            </h4>
          </Col>
          <Col sm={6}>
            <MessageInfo />
          </Col>
        </Row>
      </div>
    </Modal>
  );
});

function bytes_to_str(bytes: number): string {
  const x = Math.round(bytes / 1000);
  if (x < 1000) {
    return x + "K";
  }
  return x / 1000 + "M";
}

const MessageInfo: React.FC = React.memo(() => {
  const intl = useIntl();

  const info = useTypedRedux("account", "mesg_info");

  if (info == null) {
    return <span></span>;
  }

  function messages(num: number): string {
    return `${num} ${intl.formatMessage(labels.message_plural, { num })}`;
  }

  const sent = intl.formatMessage({
    id: "connection-info.messages_sent",
    defaultMessage: "sent",
    description: "Messages sent",
  });

  const received = intl.formatMessage({
    id: "connection-info.messages_received",
    defaultMessage: "received",
    description: "Messages received",
  });

  return (
    <div>
      <pre>
        {messages(info.get("sent"))} {sent} (
        {bytes_to_str(info.get("sent_length"))})
        <br />
        {messages(info.get("recv"))} {received} (
        {bytes_to_str(info.get("recv_length"))})
        <br />
        <span
          style={
            info.get("count") > 0
              ? { color: "#08e", fontWeight: "bold" }
              : undefined
          }
        >
          {messages(info.get("count"))} in flight
        </span>
        <br />
        {messages(info.get("enqueued"))} queued to send
      </pre>
      <div style={{ color: COLORS.GRAY_M }}>
        <FormattedMessage
          id="connection-info.info"
          defaultMessage={`Connection icon color changes as the number of messages in flight to a hub increases.
          Usually, no action is needed, but the counts are helpful for diagnostic purposes.
          The maximum number of messages that can be sent at the same time is {max}.`}
          values={{ max: info.get("max_concurrent") }}
        />
      </div>
    </div>
  );
});
