/*
Add collaborators to a project
*/

import { React, Component, rtypes, rclass, redux } from "../app-framework";

const { ErrorDisplay, Icon, MarkdownInput } = require("../r_misc");

import { PickerList } from "./picker-list";

const { webapp_client } = require("../webapp_client");

const { ProjectSettingsPanel } = require("../project/project-settings-support");

const {
  callback_opts
} = require("smc-webapp/frame-editors/generic/async-utils");

import { callback } from "awaiting";

import * as immutable from "immutable";

import { User } from "../frame-editors/generic/client";

import { FormGroup, FormControl, Button, ButtonToolbar } from "react-bootstrap";

const { SITE_NAME } = require("smc-util/theme");

/**
 * Returns a list of account_id's for users.
 */
async function search_for_accounts(
  search = ""
): Promise<User & { profile: { color: string; image: string } }[]> {
  search = search.trim();
  if (search === "") {
    return [];
  }
  const select = await callback_opts(webapp_client.user_search)({
    query: search,
    limit: 50
  });
  const profiles = await callback_opts(
    webapp_client.query({
      query: select.map(u => ({
        account_id: u.account_id,
        profile: null
      }))
    })
  );
  const users = {};
  for (let u of select) {
    users[u.account_id] = u;
  }
  for (let u of profiles) {
    u = u.account_profiles;
    if (users[u.account_id]) {
      users[u.account_id].profile = u.profile;
    }
  }
  console.log("USERS = ", users);
  return users;
}

interface AddCollaboratorsPanelProps {
  // OWN PROPS
  project: any;
  // REDUX PROPS
  get_fullname(): string;
  user_map: immutable.Map<any, any>;
  actions: any;
}

interface AddCollaboratorsPanelState {
  search: string;
  loading: boolean;
  results: User[];
  selection: User[];
  error: any;
  email_to: string;
  email_body: string;
  is_editing_email: boolean;
}

class AddCollaboratorsPanel0 extends Component<
  AddCollaboratorsPanelProps,
  AddCollaboratorsPanelState
> {
  static reduxProps() {
    return {
      account: {
        get_fullname: rtypes.func
      },
      users: {
        user_map: rtypes.immutable
      }
    };
  }
  constructor(props: AddCollaboratorsPanelProps, context: any) {
    super(props, context);
    this.state = this.initialState();
  }
  initialState = () => {
    return {
      search: "",
      selection: [],
      loading: false,
      error: undefined,
      results: [],
      email_to: "",
      email_body: this.default_email_body(),
      is_editing_email: false
    };
  };
  reset = () => this.setState(this.initialState());
  render_manual_email_entry() {
    return (
      <>
        Enter an email address manually:
        <FormGroup style={{ margin: "15px" }}>
          <FormControl
            type="text"
            value={this.state.email_to || ""}
            placeholder="Enter a comma-separated list of email addresses"
            onChange={(e: any) => this.setState({ email_to: e.target.value })}
          />
        </FormGroup>
      </>
    );
  }
  render_cocalc_user_search() {
    return (
      <>
        Search for a CoCalc user:
        <PickerList
          inputValue={this.state.search}
          onInputChange={search => {
            this.setState({ search, loading: true });
            // TODO: debounce/cache/cancel on unmount
            search_for_accounts(search)
              .then(results => {
                this.setState({
                  results: results.filter(
                    u =>
                      this.state.selection.find(
                        s => s.account_id === u.account_id
                      ) === undefined
                  ),
                  loading: false
                });
              })
              .catch(error => {
                this.setState({
                  loading: false,
                  error
                });
              });
          }}
          isLoading={this.state.loading}
          results={this.state.results.map(u => {
            return {
              key: u.account_id,
              value: u,
              label: (
                <div>
                  {u.first_name} {u.last_name}
                </div>
              )
            };
          })}
          onSelect={value => {
            this.setState({
              selection: this.state.selection.concat([value]),
              results: this.state.results.filter(
                u => u.account_id !== value.account_id
              )
            });
          }}
        />
        {this.state.error != null && (
          <ErrorDisplay
            error={this.state.error}
            onClose={() => this.setState({ error: undefined })}
          />
        )}
      </>
    );
  }
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
  render_invitation_editor() {
    return (
      <>
        Customize the invitation. It will be sent to
        {render_list_with_oxford_comma(
          this.state.selection
            .map(u => ` "${u.first_name} ${u.last_name}"`)
            .concat(
              this.state.email_to
                ? this.state.email_to.split(",").map(s => `"${s.trim()}"`)
                : []
            )
        )}.
        <div
          style={{
            border: "1px solid lightgrey",
            padding: "10px",
            borderRadius: "5px",
            backgroundColor: "white",
            margin: "15px"
          }}
        >
          <MarkdownInput
            default_value={this.state.email_body}
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

  send_invites = () => {
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
    if (this.state.email_to) {
      redux
        .getActions("projects")
        .invite_collaborators_by_email(
          this.props.project.get("project_id"),
          this.state.email_to,
          this.state.email_body,
          subject,
          false,
          replyto,
          replyto_name
        );
    }
    this.state.selection.forEach(u => {
      redux
        .getActions("projects")
        .invite_collaborator(
          this.props.project.get("project_id"),
          u.account_id,
          this.state.email_body,
          subject,
          false,
          replyto,
          replyto_name
        );
    });
    this.reset();
  };

  render_buttons() {
    return (
      <ButtonToolbar>
        <Button onClick={this.send_invites} bsStyle="primary">
          <Icon name="user-plus" /> Send Invitation
        </Button>
        <Button onClick={this.reset}>Cancel</Button>
      </ButtonToolbar>
    );
  }

  render() {
    return (
      <ProjectSettingsPanel title="Add New Collaborator" icon="plus">
        Who would you like to invite to work with on this project? Anybody
        listed here can simultaneously work with you on any notebooks and
        terminals in this project, and add other people to this project.
        <hr />
        {this.render_cocalc_user_search()}
        {this.render_manual_email_entry()}
        {this.state.selection.length > 0 || this.state.email_to ? (
          <>
            {this.render_invitation_editor()}
            {this.render_buttons()}
          </>
        ) : (
          undefined
        )}
      </ProjectSettingsPanel>
    );
  }
}

export const AddCollaboratorsPanel = rclass(AddCollaboratorsPanel0);

function render_list_with_oxford_comma(names: string[]) {
  if (names.length === 0) {
    return;
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  names[names.length - 1] = `and ${names[names.length - 1]}`;
  return names.join(", ");
}
