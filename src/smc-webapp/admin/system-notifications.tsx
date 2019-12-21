import {
  React,
  ReactDOM,
  Component,
  rtypes,
  rclass,
  redux,
  Rendered
} from "../app-framework";

import {
  Button,
  ButtonToolbar,
  FormGroup,
  FormControl,
  Well
} from "react-bootstrap";

import { Map } from "immutable";

import { plural } from "smc-util/misc2";

import { Icon, Loading } from "../r_misc";

interface Props {
  notifications?: Map<string, any>;
}

interface State {
  state: "view" | "edit";
  mesg?: string;
}

class SystemNotifications extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { state: "view" };
  }

  static reduxProps(): any {
    return {
      system_notifications: { notifications: rtypes.immutable }
    };
  }

  render_mark_done(): Rendered {
    if (!this.props.notifications) return;
    let open = 0;
    this.props.notifications.map((mesg: Map<string, any>) => {
      if (mesg && !mesg.get("done")) {
        open += 1;
      }
    });
    if (open > 0) {
      return (
        <Button onClick={() => this.mark_all_done()}>
          Mark {open} {plural(open, "Notification")} Done
        </Button>
      );
    } else {
      return <Button disabled={true}>No Outstanding Notifications</Button>;
    }
  }

  render_buttons(): Rendered {
    return (
      <ButtonToolbar>
        <Button onClick={() => this.setState({ state: "edit", mesg: "" })}>
          Compose...
        </Button>
        {this.render_mark_done()}
      </ButtonToolbar>
    );
  }

  render_editor(): Rendered {
    return (
      <Well>
        <FormGroup>
          <FormControl
            autoFocus
            value={this.state.mesg}
            ref="input"
            rows={3}
            componentClass="textarea"
            onChange={() =>
              this.setState({
                mesg: ReactDOM.findDOMNode(this.refs.input).value
              })
            }
          />
        </FormGroup>
        <ButtonToolbar>
          <Button onClick={() => this.send()} bsStyle="danger">
            <Icon name="paper-plane-o" /> Send
          </Button>
          <Button onClick={() => this.setState({ state: "view" })}>
            Cancel
          </Button>
        </ButtonToolbar>
      </Well>
    );
  }

  send(): void {
    this.setState({ state: "view" });
    if (!this.state.mesg) return;
    (redux.getActions("system_notifications") as any).send_message({
      text: this.state.mesg.trim(),
      priority: "high"
    });
  }

  mark_all_done(): void {
    (redux.getActions("system_notifications") as any).mark_all_done();
  }

  render_body(): Rendered {
    if (this.props.notifications == null) {
      return <Loading />;
    }
    switch (this.state.state) {
      case "view":
        return this.render_buttons();
      case "edit":
        return this.render_editor();
    }
  }

  render(): Rendered {
    return (
      <div>
        <h4>System Notifications</h4>
        {this.render_body()}
      </div>
    );
  }
}

const SystemNotifications0 = rclass(SystemNotifications);
export { SystemNotifications0 as SystemNotifications };
