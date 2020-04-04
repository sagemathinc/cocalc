import * as React from "react";
import { Icon, MessageDisplay, SettingBox } from "smc-webapp/r_misc";
import { Row, Col, Button } from "react-bootstrap";
import { Project } from "./types";

const { webapp_client } = require("../../webapp_client");

interface Props {
  project: Project;
}

interface State {
  loading: boolean;
  message: string;
}

export class SagewsControl extends React.Component<Props, State> {
  private _mounted: boolean;

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      message: "",
    };
  }

  componentDidMount() {
    return (this._mounted = true);
  }

  componentWillUnmount() {
    return delete this._mounted;
  }

  restart_worksheet = () => {
    this.setState({ loading: true });
    webapp_client.exec({
      project_id: this.props.project.get("project_id"),
      command: "smc-sage-server stop; smc-sage-server start",
      timeout: 30,
      cb: (err, _output) => {
        if (!this._mounted) {
          // see https://github.com/sagemathinc/cocalc/issues/1684
          return;
        }
        this.setState({ loading: false });
        if (err) {
          this.setState({
            message:
              "Error trying to restart worksheet server. Try restarting the project server instead.",
          });
        } else {
          this.setState({
            message:
              "Worksheet server restarted. Restarted worksheets will use a new Sage session.",
          });
        }
      },
    });
  };

  render_message() {
    if (this.state.message) {
      return (
        <MessageDisplay
          message={this.state.message}
          onClose={() => this.setState({ message: "" })}
        />
      );
    }
  }

  render() {
    return (
      <SettingBox title="Sage worksheet server" icon="refresh">
        <Row>
          <Col sm={8}>
            Restart this Sage Worksheet server. <br />
            <span style={{ color: "#666" }}>
              Existing worksheet sessions are unaffected; restart this server if
              you customize $HOME/bin/sage, so that restarted worksheets will
              use the new version of Sage.
            </span>
          </Col>
          <Col sm={4}>
            <Button
              bsStyle="warning"
              disabled={this.state.loading}
              onClick={this.restart_worksheet}
            >
              <Icon name="refresh" spin={this.state.loading} /> Restart Sage
              Worksheet Server
            </Button>
          </Col>
        </Row>
        {this.render_message()}
      </SettingBox>
    );
  }
}
