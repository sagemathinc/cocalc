import { Col, Row } from "../../antd-bootstrap";
import { React, redux, useRedux } from "../../app-framework";
import { A } from "../../r_misc";
//import { SSHKeyList, SSHKeyAdder } from "../../widget-ssh-keys/main";
const { SSHKeyList, SSHKeyAdder } = require("../../widget-ssh-keys/main");

export const SSHKeysPage: React.FC<> = () => {
  function render_pre_list_message() {
    return (
      <div style={{ marginTop: "10px", marginBottom: "10px", color: "#444" }}>
        The global SSH keys listed here allow you to connect from your computer
        via SSH to{" "}
        <b>
          <i>all projects</i>
        </b>{" "}
        on which you are an owner or collaborator. Alternatively, set SSH keys
        that grant access only to a project in the settings for that project.
        See the SSH part of the settings page in a project for further
        instructions.
      </div>
    );
  }

  function help() {
    return (
      <div>
        To SSH into a project, use the following{" "}
        <span style={{ color: "#666" }}>username@host:</span>
        <pre>[projectIdWithoutDashes]@ssh.cocalc.com </pre>
        The project id without dashes can be found in the part of project
        settings about SSH keys. To SSH between projects, use{" "}
        <pre>[projectIdWithoutDashes]@ssh</pre>
      </div>
    );
  }

  const ssh_keys = useRedux(["account", "ssh_keys"]);

  return (
    <div style={{ marginTop: "1em" }}>
      <Row>
        <Col md={8}>
          {render_pre_list_message()}
          <SSHKeyList
            ssh_keys={ssh_keys}
            pre_list={render_pre_list_message()}
            delete_key={(fingerprint) =>
              redux.getActions("account").delete_ssh_key(fingerprint)
            }
            help={help()}
          />
        </Col>
        <Col md={4}>
          <SSHKeyAdder
            add_ssh_key={(opts) =>
              redux.getActions("account").add_ssh_key(opts)
            }
            style={{ marginBottom: "0px" }}
          />
          <div style={{ marginTop: "10px" }}>
            <A href="https://github.com/sagemathinc/cocalc/wiki/AllAboutProjects#create-ssh-key">
              How to create SSH Keys...
            </A>
          </div>
        </Col>
      </Row>
    </div>
  );
};
