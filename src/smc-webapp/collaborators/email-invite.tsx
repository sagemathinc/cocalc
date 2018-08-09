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
  onCancel(): void;
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
    const replyto = redux.getStore("account").get_email_address();
    const replyto_name = redux.getStore("account").get_fullname();
    const SiteName = redux.getStore("customize").get("site_name") || SITE_NAME;
    let subject: string;
    if (replyto_name != null) {
      subject = `${replyto_name} added you to project ${this.props.project.get(
        "title"
      )}`;
    } else {
      subject = `${SiteName} Invitation to project ${this.props.project.get(
        "title"
      )}`;
    }
    this.props
      .actions("projects")
      .invite_collaborators_by_email(
        this.props.project.get("project_id"),
        this.state.email_to,
        this.state.email_body,
        subject,
        false,
        replyto,
        replyto_name
      );
    this.setState({
      is_editing_email: false,
      email_body: undefined,
      email_to: undefined,
      show_email_form: undefined
    });
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
    // TODO: show this always and put a "to" field in the email `preview`
    // so that you can both click on peopel and also enter custom email addresses
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
        <div
          style={{
            border: "1px solid lightgrey",
            padding: "10px",
            borderRadius: "5px",
            backgroundColor: "white",
            marginBottom: "15px"
          }}
        >
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
        </div>
      </>
    );
  }

  render() {
    return (
      <>
        {this.render_email_editor()}
        {this.props.initees.length > 0 && (
          <ButtonToolbar>
            <Button onClick={this.send_email} bsStyle="primary">
              <Icon name="user-plus" /> Send Invitation
            </Button>
            <Button onClick={this.props.onCancel}>Cancel</Button>
          </ButtonToolbar>
        )}
      </>
    );
  }
}

export const EmailInvite: ComponentType<EmailInviteOwnProps> = rclass(
  EmailInvite0
);
