/*
Add collaborators to a project
*/

import { React, Component, rtypes, rclass } from "../app-framework";

const { ErrorDisplay } = require("../r_misc");

import { PickerList } from "./picker-list";

const { webapp_client } = require("../webapp_client");

const { ProjectSettingsPanel } = require("../project/project-settings-support");

const {
  callback_opts
} = require("smc-webapp/frame-editors/generic/async-utils");

import * as immutable from "immutable";

import { EmailInvite } from "./email-invite";
import { User } from "../frame-editors/generic/client";
import "react-select/dist/react-select.css";

/**
 * Returns a list of account_id's for users.
 */
async function search_for_accounts(search = ""): Promise<User[]> {
  search = search.trim();
  if (search === "") {
    return [];
  }
  const select = await callback_opts(webapp_client.user_search)({
    query: search,
    limit: 50
  });
  return select;
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
    this.state = {
      search: "",
      selection: [],
      loading: false,
      error: undefined,
      results: []
    };
  }
  render_list() {
    return (
      <>
        <br />
        <br />
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
        <br />
        <br />

        {this.state.error != null && (
          <ErrorDisplay
            error={this.state.error}
            onClose={() => this.setState({ error: undefined })}
          />
        )}
      </>
    );
  }

  render_email_invite() {
    if (this.state.loading || this.state.results == null) {
      return;
    }
    return (
      <EmailInvite
        invitees={this.state.selection}
        project={this.props.project}
        onSend={() => "TODO"}
      />
    );
  }

  render() {
    return (
      <ProjectSettingsPanel title="Add New Collaborator" icon="plus">
        {this.render_list()}
        {this.render_email_invite()}
      </ProjectSettingsPanel>
    );
  }
}

export const AddCollaboratorsPanel = rclass(AddCollaboratorsPanel0);
