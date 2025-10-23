/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage } from "react-intl";

import { useRedux } from "@cocalc/frontend/app-framework";
import { A, Paragraph, Text } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

import SSHKeyList from "./ssh-key-list";

export default function GlobalSSHKeys() {
  const ssh_keys = useRedux("account", "ssh_keys");

  return (
    <div style={{ marginTop: "1em" }}>
      <SSHKeyList
        help={
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
        }
        ssh_keys={ssh_keys}
      >
        <Paragraph style={{ color: COLORS.GRAY_M }}>
          <FormattedMessage
            id="account.global-ssh-keys.info"
            defaultMessage={`The SSH keys listed here allow you to connect via SSH
            to <strong><i>all projects</i> and <i>compute servers</i></strong>
            on which you are a collaborator.
            Alternatively, set SSH keys that grant access only to a project in the settings for that project.
            See <A>the docs</A>
            or the SSH part of the settings page in a project for further instructions.
            Adding keys here simply automates them being added to the file ~/.ssh/authorized_keys`}
            values={{
              strong: (c) => <Text strong>{c}</Text>,
              i: (c) => <i>{c}</i>,
              A: (c) => (
                <A href="https://doc.cocalc.com/account/ssh.html">{c}</A>
              ),
            }}
          />
        </Paragraph>
      </SSHKeyList>
    </div>
  );
}
