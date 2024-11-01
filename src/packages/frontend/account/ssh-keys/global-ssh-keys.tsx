/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage } from "react-intl";

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { A, Paragraph, Text } from "@cocalc/frontend/components";
import { Footer } from "@cocalc/frontend/customize";
import { COLORS } from "@cocalc/util/theme";

import { SSHKeyAdder } from "./ssh-key-adder";
import { SSHKeyList } from "./ssh-key-list";

export const SSHKeysPage: React.FC = () => {
  const ssh_keys = useRedux("account", "ssh_keys");

  function render_pre_list_message() {
    return (
      <Paragraph style={{ color: COLORS.GRAY_M }}>
        <FormattedMessage
          id="account.global-ssh-keys.info"
          defaultMessage={`The global SSH keys listed here allow you to connect from your computer via SSH
            to <strong><i>all projects</i> and <i>compute servers</i></strong>
            on which you are an owner or collaborator.
            Alternatively, set SSH keys that grant access only to a project in the settings for that project.
            See <A>the docs</A>
            or the SSH part of the settings page in a project for further instructions.`}
          values={{
            strong: (c) => <Text strong>{c}</Text>,
            i: (c) => <i>{c}</i>,
            A: (c) => <A href="https://doc.cocalc.com/account/ssh.html">{c}</A>,
          }}
        />
      </Paragraph>
    );
  }

  function help() {
    return (
      <Paragraph>
        <FormattedMessage
          id="account.global-ssh-keys.help"
          defaultMessage={`To SSH into a project, use the following
          <code>username@host: [project-id-without-dashes]@ssh.cocalc.com</code>
          The project id without dashes can be found in the part of project settings about SSH keys.
          To SSH between projects, use <code>[project-id-without-dashes]@ssh</code>`}
          values={{ code: (c) => <Paragraph code>{c}</Paragraph> }}
        />
      </Paragraph>
    );
  }

  return (
    <div style={{ marginTop: "1em" }}>
      <Row>
        <Col md={10}>{render_pre_list_message()}</Col>
        <Col md={2}>
          <div style={{ marginTop: "10px", fontSize: "12pt" }}>
            <A href="https://doc.cocalc.com/account/ssh.html">Docs...</A>
          </div>
        </Col>
        <Col md={12}>
          <SSHKeyList help={help()} ssh_keys={ssh_keys} />
          <SSHKeyAdder
            add_ssh_key={(opts) =>
              redux.getActions("account").add_ssh_key(opts)
            }
            style={{ marginBottom: "0px" }}
          />
        </Col>
      </Row>
      <Footer />
    </div>
  );
};
