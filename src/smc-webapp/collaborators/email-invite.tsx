import { React, Component, redux, rtypes, rclass } from "../app-framework";

import {
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Well
} from "react-bootstrap";

const { Icon, MarkdownInput } = require("../r_misc");

const { SITE_NAME } = require("smc-util/theme");

import * as immutable from "immutable";
import { User } from "../frame-editors/generic/client";
import { ComponentType } from "react";

interface EmailInviteOwnProps {
  invitees: User[];
  onSend(): void;
  project: any;
}

interface EmailInviteReduxProps {
  get_fullname: any;
  user_map: immutable.Map<any, any>;
  actions: any;
}

type EmailInviteProps = EmailInviteOwnProps & EmailInviteReduxProps;

interface EmailInviteState {
  is_editing_email?: boolean;
  email_body?: string;
  email_to?: string;
  show_email_form?: boolean;
}

class EmailInvite0 extends Component<EmailInviteProps, EmailInviteState> {
  static reduxProps() {
    return {
      account: {
        get_fullname: rtypes.func
      }
    };
  }

  constructor(props: EmailInviteProps, context: any) {
    super(props, context);
    this.state = {};
  }

  send_email = () => {
    // TODO
    this.props.onSend();
  };

  default_email_body = () => {
    const name = this.props.get_fullname();
    const project_id = this.props.project.get("project_id");
    const title = this.props.project.get("title");
    const host = window.location.hostname;
    const target = `[project '${title}'](https://${host}/projects/${project_id})`;
    const SiteName =
      (redux.getStore as any)("customize").get("site_name") || SITE_NAME;
    const email_body = `
Hello!

Please collaborate with me using [${SiteName}](https://${host}) on ${target}.

Best wishes,

${name}
`;
    return email_body.trim();
  };

  render_email_editor() {
    return (
      <>
        {this.props.invitees.length === 0 ? (
          <>
            Enter one or more email addresses separated by commas:
            <FormGroup>
              <FormControl
                autoFocus
                type="text"
                value={this.state.email_to}
                onChange={(e: any) =>
                  this.setState({ email_to: e.target.value })
                }
              />
            </FormGroup>
          </>
        ) : (
          undefined
        )}
        <MarkdownInput
          default_value={
            this.state.email_body != null
              ? this.state.email_body
              : this.default_email_body()
          }
          rows={8}
          on_save={value =>
            this.setState({ email_body: value, is_editing_email: false })
          }
          on_cancel={value =>
            this.setState({ email_body: value, is_editing_email: false })
          }
        />
      </>
    );
  }

  render_send_button() {
    if (this.props.invitees.length === 0) {
      return; // TODO
    }
    return (
      <Button onClick={this.send_email} bsStyle="primary">
        <Icon name="user-plus" />{" "}
        {this.props.invitees.length === 1
          ? `Invite ${this.props.invitees[0].first_name} ${
              this.props.invitees[0].first_name
            }`
          : `Invite ${this.props.invitees.length} Users`}
      </Button>
    );
  }

  render() {
    if (this.props.invitees.length === 0) {
      return (
        <>
          <Button
            onClick={() => this.setState({ show_email_form: true })}
            disabled={this.state.show_email_form}
          >
            <Icon name="envelope" /> Send email invitation...
          </Button>
          {this.state.show_email_form ? (
            <Well>
              {this.render_email_editor()}
              <br />
              <ButtonToolbar>
                {this.render_send_button()}
                <Button
                  onClick={() => this.setState({ show_email_form: false })}
                >
                  Cancel
                </Button>
              </ButtonToolbar>
            </Well>
          ) : (
            undefined
          )}
        </>
      );
    }
    return (
      <>
        {this.render_email_editor()}
        <ButtonToolbar>{this.render_send_button()}</ButtonToolbar>
      </>
    );
  }
}

export const EmailInvite: ComponentType<EmailInviteOwnProps> = rclass(
  EmailInvite0
);
