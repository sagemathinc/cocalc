/*
Add collaborators to a project
*/
import * as React from "react";
import { rtypes, rclass, redux } from "../app-framework";
import { ErrorDisplay, Icon, MarkdownInput, SettingBox } from "../r_misc";
import { PickerList } from "./picker-list";
const { webapp_client } = require("../webapp_client");
const { callback_opts } = require("smc-util/async-utils");
import * as immutable from "immutable";
import { User } from "../frame-editors/generic/client";
import { FormGroup, FormControl, Button, ButtonToolbar } from "react-bootstrap";
const { SITE_NAME } = require("smc-util/theme");
const onecolor = require("onecolor");
import { contains_url } from "smc-util/misc2";
import { debounce } from "lodash";

import { has_internet_access } from "../upgrades/upgrade-utils";
import { Project } from "smc-webapp/project/settings/types";

type UserAndProfile = User & {
  profile: { color?: string; image?: string };
  is_collaborator?: boolean;
  is_selected?: boolean;
};

/**
 * Returns a list of account_id's for users.
 */
async function search_for_accounts(search = ""): Promise<UserAndProfile[]> {
  search = search.trim();
  if (search === "") {
    return [];
  }
  const select: User[] = await callback_opts(webapp_client.user_search)({
    query: search,
    limit: 25
  });
  const profiles: {
    query: {
      account_profiles: {
        account_id: string;
        profile: { color?: string; image?: string };
      };
    }[];
  } = await callback_opts(webapp_client.query)({
    query: select.map(u => ({
      account_profiles: {
        account_id: u.account_id,
        profile: null
      }
    }))
  });
  const users: any = {};
  for (let u of select) {
    users[u.account_id] = u;
  }
  for (let u of profiles.query) {
    if (users[u.account_profiles.account_id]) {
      users[u.account_profiles.account_id].profile = u.account_profiles.profile;
    }
  }
  const arr = Object.keys(users)
    .map(k => users[k])
    .map(u => {
      u.profile = u.profile || {};
      return u;
    });
  return arr;
}

interface ReactProps {
  project: Project;
  on_invite?: () => void;
  allow_urls: boolean;
}

interface ReduxProps {
  get_fullname: () => string;
  user_map: immutable.Map<any, any>;
}

interface State {
  search: string;
  loading: boolean;
  results?: UserAndProfile[];
  selection: UserAndProfile[];
  error: any;
  email_to: string;
  email_body: string;
  is_editing_email: boolean;
  error_body?: string;
}

export const AddCollaboratorsPanel = rclass<ReactProps>(
  class AddCollaboratorsPanel extends React.Component<
    ReactProps & ReduxProps,
    State
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
    constructor(props) {
      super(props);
      this.state = this.initialState();
      this.check_email_body = debounce(this.check_email_body.bind(this), 50, {
        leading: true,
        trailing: true
      });
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
        is_editing_email: false,
        error_body: undefined
      };
    };

    reset = () => this.setState(this.initialState());

    render_manual_email_entry() {
      if (!this.props.project) return;
      if (!has_internet_access(this.props.project)) {
        return (
          <>
            If you enable the Internet Access upgrade for this project, then you
            can also invite people to collaborate on this project who do not
            currently have a CoCalc account. They will receive an email
            invitation. Otherwise, you must ask them to create an account, and
            then invite them using the box above.
          </>
        );
      }
      return (
        <>
          Or, type a comma-separated list of email addresses:
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

    render_avatar(u: UserAndProfile) {
      const size = 30;
      if (u.profile.image) {
        return (
          <img
            style={{
              borderRadius: "50%",
              verticalAlign: "top",
              height: `${size}px`,
              width: `${size}px`
            }}
            src={u.profile.image}
          />
        );
      }
      const bg = u.profile.color || "#eee";
      return (
        <span
          style={{
            textAlign: "center",
            height: `${size}px`,
            width: `${size}px`,
            lineHeight: `${size}px`,
            display: "block",
            borderRadius: "50%",
            fontFamily: "sans-serif",
            fontSize: `${0.7 * size}px`,
            backgroundColor: bg,
            color:
              ((onecolor(bg).magenta && onecolor(bg).magenta()) || 0) >= 0.4
                ? "white"
                : "black"
          }}
        >
          {u.first_name ? u.first_name.toUpperCase()[0] : "?"}
        </span>
      );
    }

    query_for_results = search => {
      this.setState({ search, loading: true });
      search_for_accounts(search)
        .then(results => {
          // filter out users that are already collaborators on this project
          results = results.filter(
            u => !this.props.project.get("users").has(u.account_id)
          );
          // put users who are collaborators on other projects at the top of the list
          const are_collaborators: UserAndProfile[] = [];
          const not_collaborators: UserAndProfile[] = [];
          for (let u of results) {
            if (this.props.user_map.has(u.account_id)) {
              u.is_collaborator = true;
              are_collaborators.push(u);
            } else {
              not_collaborators.push(u);
            }
          }
          // sort by the last known activity
          const cmp = (a: any, b: any) => {
            if (a.last_active < b.last_active) {
              return 1;
            }
            if (a.last_active > b.last_active) {
              return -1;
            }
            if (a.last_name < b.last_name) {
              return 1;
            }
            if (a.last_name > b.last_name) {
              return -1;
            }
            if (a.account_id < b.account_id) {
              return 1;
            }
            if (a.account_id > b.account_id) {
              return -1;
            }
            return 0;
          };
          are_collaborators.sort(cmp);
          not_collaborators.sort(cmp);
          results = are_collaborators.concat(not_collaborators);
          // mark those that are selected
          for (let i = 0; i < results.length; i++) {
            const u = results[i];
            if (this.state.selection.find(w => w.account_id === u.account_id)) {
              u.is_selected = true;
            }
          }
          // update state
          this.setState({
            results,
            loading: false
          });
        })
        .catch(error => {
          this.setState({
            loading: false,
            error
          });
        });
    };

    render_cocalc_user_search() {
      return (
        <>
          Search by name or email address for CoCalc users:
          <PickerList
            inputValue={this.state.search}
            onInputChange={search =>
              this.setState({ search, results: undefined })
            }
            onInputEnter={() => this.query_for_results(this.state.search)}
            isLoading={this.state.loading}
            results={
              this.state.results &&
              this.state.results.map(u => {
                const last_active =
                  u.last_active != null
                    ? new Date(u.last_active).toLocaleDateString()
                    : undefined;
                const created =
                  u.created != null
                    ? new Date(u.created).toLocaleDateString()
                    : undefined;
                return {
                  key: u.account_id,
                  value: u,
                  highlight: u.is_selected,
                  label: (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        overflow: "auto",
                        height: "60px"
                      }}
                    >
                      {this.render_avatar(u)}
                      <span
                        style={{
                          fontSize: "16px"
                        }}
                      >
                        {u.first_name} {u.last_name}
                      </span>
                      <div
                        style={{
                          width: "145px",
                          fontSize: "14px",
                          textAlign: "right",
                          display: "flex",
                          flexDirection: "column"
                        }}
                      >
                        {u.is_collaborator ? (
                          <div>Collaborator</div>
                        ) : (
                          undefined
                        )}
                        {last_active != null ? (
                          <div>{`Last active ${last_active}`}</div>
                        ) : (
                          undefined
                        )}
                        {created != null ? (
                          <div>{`Created ${created}`}</div>
                        ) : (
                          undefined
                        )}
                      </div>
                    </div>
                  )
                };
              })
            }
            onSelect={u => {
              if (
                this.state.selection.find(w => w.account_id === u.account_id)
              ) {
                this.setState({
                  selection: this.state.selection.filter(
                    w => w.account_id !== u.account_id
                  ),
                  results:
                    this.state.results &&
                    this.state.results.map(w => ({
                      ...w,
                      is_selected:
                        w.account_id === u.account_id ? false : w.is_selected
                    }))
                });
              } else {
                this.setState({
                  selection: this.state.selection.concat([u]),
                  results:
                    this.state.results &&
                    this.state.results.map(w => ({
                      ...w,
                      is_selected:
                        w.account_id === u.account_id ? true : w.is_selected
                    }))
                });
              }
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
      const title = this.props.project.get("title");
      const target = `project '${title}'`;
      const SiteName =
        (redux.getStore as any)("customize").get("site_name") || SITE_NAME;
      const email_body = `
Hello!

Please collaborate with me using ${SiteName} on ${target}.

Best wishes,

${name}
`;
      return email_body.trim();
    };

    check_email_body(value: string): void {
      if (!this.props.allow_urls && contains_url(value)) {
        this.setState({
          error_body: "Sending URLs is not allowed. (anti-spam measure)"
        });
      } else {
        this.setState({ error_body: undefined });
      }
    }

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
          )}
          .
          <div
            style={{
              border: "1px solid lightgrey",
              padding: "10px",
              borderRadius: "5px",
              backgroundColor: "white",
              margin: "15px"
            }}
          >
            {this.render_invitation_error()}
            <MarkdownInput
              default_value={this.state.email_body}
              rows={8}
              on_save={value =>
                this.setState({ email_body: value, is_editing_email: false })
              }
              on_cancel={value =>
                this.setState({
                  email_body: value,
                  is_editing_email: false,
                  error_body: undefined
                })
              }
              on_change={this.check_email_body}
              save_disabled={this.state.error_body != null}
            />
          </div>
        </>
      );
    }

    send_invites = () => {
      const replyto = redux.getStore("account").get_email_address();
      const replyto_name = redux.getStore("account").get_fullname();
      const SiteName =
        redux.getStore("customize").get("site_name") || SITE_NAME;
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
      if (this.props.on_invite) {
        this.props.on_invite();
      }
      this.reset();
    };

    render_buttons() {
      return (
        <ButtonToolbar>
          <Button
            onClick={this.send_invites}
            disabled={this.state.error_body != null}
            bsStyle="primary"
          >
            <Icon name="user-plus" /> Add Collaborator
          </Button>
          <Button onClick={this.reset}>Cancel</Button>
        </ButtonToolbar>
      );
    }

    render_invitation_error() {
      if (this.state.error_body == null) return;

      return <ErrorDisplay error={this.state.error_body} />;
    }

    render() {
      return (
        <SettingBox title="Add new collaborators" icon="plus">
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
        </SettingBox>
      );
    }
  }
);

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
