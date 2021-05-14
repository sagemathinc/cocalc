/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Add collaborators to a project
*/

import { Alert, Input, Select } from "antd";
import {
  React,
  redux,
  useActions,
  useIsMountedRef,
  useMemo,
  useRef,
  useTypedRedux,
  useState,
} from "../app-framework";
import { Button, ButtonToolbar, Well } from "../antd-bootstrap";
import { Icon, Loading, ErrorDisplay, Space } from "../r_misc";
import { webapp_client } from "../webapp-client";
import { SITE_NAME } from "smc-util/theme";
import {
  contains_url,
  plural,
  cmp,
  trunc_middle,
  is_valid_email_address,
  is_valid_uuid_string,
  search_match,
  search_split,
} from "smc-util/misc";
import { Project } from "../projects/store";
import { Avatar } from "../account/avatar/avatar";
import { ProjectInviteTokens } from "./project-invite-tokens";
import { alert_message } from "../alerts";
import { useStudentProjectFunctionality } from "smc-webapp/course";

interface RegisteredUser {
  sort?: string;
  account_id: string;
  first_name?: string;
  last_name?: string;
  last_active?: Date;
  created?: Date;
  email_address?: string;
  email_address_verified?: boolean;
  label?: string;
  tag?: string;
  name?: string;
}

interface NonregisteredUser {
  sort?: string;
  email_address: string;
  account_id?: undefined;
  first_name?: undefined;
  last_name?: undefined;
  last_active?: undefined;
  created?: undefined;
  email_address_verified?: undefined;
  label?: string;
  tag?: string;
  name?: string;
}

type User = RegisteredUser | NonregisteredUser;

interface Props {
  project_id: string;
  autoFocus?: boolean;
}

type State = "input" | "searching" | "searched" | "invited" | "invited_errors";

export const AddCollaborators: React.FC<Props> = ({
  autoFocus,
  project_id,
}) => {
  const student = useStudentProjectFunctionality(project_id);
  const user_map = useTypedRedux("users", "user_map");
  const project_map = useTypedRedux("projects", "project_map");
  const project: Project | undefined = useMemo(
    () => project_map?.get(project_id),
    [project_id, project_map]
  );

  // search that user has typed in so far
  const [search, set_search] = useState<string>("");
  const search_ref = useRef<string>("");

  // list of results for doing the search -- turned into a selector
  const [results, set_results] = useState<User[]>([]);
  const [num_matching_already, set_num_matching_already] = useState<number>(0);

  // list of actually selected entries in the selector list
  const [selected_entries, set_selected_entries] = useState<string[]>([]);
  const select_ref = useRef<any>(null);

  // currently carrying out a search
  const [state, set_state] = useState<State>("input");
  const [focused, set_focused] = useState<boolean>(false);
  // display an error in case something went wrong doing a search
  const [err, set_err] = useState<string>("");
  // if set, adding user via email to this address
  const [email_to, set_email_to] = useState<string>("");
  // with this body.
  const [email_body, set_email_body] = useState<string>("");
  const [email_body_error, set_email_body_error] = useState<string>("");
  const [email_body_editing, set_email_body_editing] = useState<boolean>(false);
  const [invite_result, set_invite_result] = useState<string>("");

  const isMountedRef = useIsMountedRef();

  const project_actions = useActions("projects");

  const allow_urls = useMemo(
    () => redux.getStore("projects").allow_urls_in_emails(project_id),
    [project_id]
  );

  function reset(): void {
    set_search("");
    set_results([]);
    set_num_matching_already(0);
    set_selected_entries([]);
    set_state("input");
    set_err("");
    set_email_to("");
    set_email_body("");
    set_email_body_error("");
    set_email_body_editing(false);
  }

  async function do_search(search: string): Promise<void> {
    if (state == "searching" || project == null) {
      // already searching
      return;
    }
    set_search(search);
    if (search.length === 0) {
      set_err("");
      set_results([]);
      return;
    }
    set_state("searching");
    let err = "";
    let search_results: User[] = [];
    let num_already_matching = 0;
    const already = new Set<string>([]);
    try {
      for (let query of search.split(",")) {
        query = query.trim().toLowerCase();
        const query_results = await webapp_client.users_client.user_search({
          query,
          limit: 30,
        });
        if (!isMountedRef.current) return; // no longer mounted
        if (query_results.length == 0 && is_valid_email_address(query)) {
          const email_address = query;
          if (!already.has(email_address)) {
            search_results.push({ email_address, sort: "0" + email_address });
            already.add(email_address);
          }
        } else {
          // There are some results, so not adding non-cloud user via email.
          // Filter out any users that already a collab on this project.
          for (const r of query_results) {
            if (r.account_id == null) continue; // won't happen
            if (project.getIn(["users", r.account_id]) == null) {
              if (!already.has(r.account_id)) {
                search_results.push(r);
                already.add(r.account_id);
              } else {
                // if we got additional information about email
                // address and already have this user, remember that
                // extra info.
                if (r.email_address != null) {
                  for (const x of search_results) {
                    if (x.account_id == r.account_id) {
                      x.email_address = r.email_address;
                    }
                  }
                }
              }
            } else {
              num_already_matching += 1;
            }
          }
        }
      }
    } catch (e) {
      err = e.toString();
    }
    set_num_matching_already(num_already_matching);
    write_email_invite();
    // sort search_results with collaborators first by last_active,
    // then non-collabs by last_active.
    search_results.sort((x, y) => {
      let c = cmp(
        x.account_id && user_map.has(x.account_id) ? 0 : 1,
        y.account_id && user_map.has(y.account_id) ? 0 : 1
      );
      if (c) return c;
      c = -cmp(x.last_active?.valueOf() ?? 0, y.last_active?.valueOf() ?? 0);
      if (c) return c;
      return cmp(x.last_name?.toLowerCase(), y.last_name?.toLowerCase());
    });

    set_state("searched");
    set_err(err);
    set_results(search_results);
    set_email_to("");
    select_ref.current?.focus();
  }

  function render_options(users: User[]): JSX.Element[] {
    const options: JSX.Element[] = [];
    for (const r of users) {
      if (r.label == null || r.tag == null || r.name == null) {
        let name = r.account_id
          ? (r.first_name ?? "") + " " + (r.last_name ?? "")
          : r.email_address;
        if (!name?.trim()) {
          name = "Anonymous User";
        }
        const tag = trunc_middle(name, 20);

        // Extra display is a bit ugly, but we need to do it for now.  Need to make
        // react rendered version of this that is much nicer (with pictures!) someday.
        const extra: string[] = [];
        if (r.account_id != null && user_map.get(r.account_id)) {
          extra.push("Collaborator");
        }
        if (r.last_active) {
          extra.push(`Active ${new Date(r.last_active).toLocaleDateString()}`);
        }
        if (r.created) {
          extra.push(`Created ${new Date(r.created).toLocaleDateString()}`);
        }
        if (r.account_id == null) {
          extra.push(`No account`);
        } else {
          if (r.email_address) {
            if (r.email_address_verified?.[r.email_address]) {
              extra.push(`${r.email_address} -- verified`);
            } else {
              extra.push(`${r.email_address} -- not verified`);
            }
          }
        }
        if (extra.length > 0) {
          name += `  (${extra.join(", ")})`;
        }
        r.label = name.toLowerCase();
        r.tag = tag;
        r.name = name;
      }
      const x = r.account_id ?? r.email_address;
      options.push(
        <Select.Option key={x} value={x} label={r.label} tag={r.tag}>
          <Avatar
            size={36}
            no_tooltip={true}
            account_id={r.account_id}
            first_name={r.account_id ? r.first_name : "@"}
            last_name={r.last_name}
          />{" "}
          <span title={r.name}>{r.name}</span>
        </Select.Option>
      );
    }
    return options;
  }

  async function invite_collaborator(account_id: string): Promise<void> {
    if (project == null) return;
    const { subject, replyto, replyto_name } = sender_info();

    await project_actions.invite_collaborator(
      project_id,
      account_id,
      email_body,
      subject,
      false,
      replyto,
      replyto_name
    );
  }

  function add_selected(): void {
    let errors = "";
    for (const x of selected_entries) {
      try {
        if (is_valid_email_address(x)) {
          invite_noncloud_collaborator(x);
        } else if (is_valid_uuid_string(x)) {
          invite_collaborator(x);
        } else {
          // skip
          throw Error(
            `BUG - invalid selection ${x} must be an email address or account_id.`
          );
        }
      } catch (err) {
        errors += `\nError - ${err}`;
      }
    }
    reset();
    if (errors) {
      set_invite_result(errors);
      set_state("invited_errors");
    } else {
      set_invite_result(`Successfully added ${selected_entries.length} users!`);
      set_state("invited");
    }
  }

  function write_email_invite(): void {
    if (project == null) return;

    const name = redux.getStore("account").get_fullname();
    const title = project.get("title");
    const target = `project '${title}'`;
    const SiteName = redux.getStore("customize").get("site_name") ?? SITE_NAME;
    const body = `Hello!\n\nPlease collaborate with me using ${SiteName} on ${target}.\n\nBest wishes,\n\n${name}`;
    set_email_to(search);
    set_email_body(body);
  }

  function sender_info(): {
    subject: string;
    replyto?: string;
    replyto_name: string;
  } {
    const replyto = redux.getStore("account").get_email_address();
    const replyto_name = redux.getStore("account").get_fullname();
    const SiteName = redux.getStore("customize").get("site_name") ?? SITE_NAME;
    let subject;
    if (replyto_name != null) {
      subject = `${replyto_name} added you to project ${project?.get("title")}`;
    } else {
      subject = `${SiteName} Invitation to project ${project?.get("title")}`;
    }
    return { subject, replyto, replyto_name };
  }

  async function invite_noncloud_collaborator(email_address): Promise<void> {
    if (project == null) return;
    const { subject, replyto, replyto_name } = sender_info();
    await project_actions.invite_collaborators_by_email(
      project_id,
      email_address,
      email_body,
      subject,
      false,
      replyto,
      replyto_name
    );
    if (!allow_urls) {
      // Show a message that they might have to email that person
      // and tell them to make a cocalc account, and when they do
      // then they will get added as collaborator to this project....
      alert_message({
        type: "warning",
        message: `For security reasons you should contact ${email_address} directly and ask them to join Cocalc to get access to this project.`,
      });
    }
  }

  function send_email_invite(): void {
    if (project == null) return;
    const { subject, replyto, replyto_name } = sender_info();
    project_actions.invite_collaborators_by_email(
      project_id,
      email_to,
      email_body,
      subject,
      false,
      replyto,
      replyto_name
    );
    set_email_to("");
    set_email_body("");
    reset();
  }

  function check_email_body(value: string): void {
    if (!allow_urls && contains_url(value)) {
      set_email_body_error("Sending URLs is not allowed. (anti-spam measure)");
    } else {
      set_email_body_error("");
    }
  }

  function render_email_body_error(): JSX.Element | undefined {
    if (!email_body_error) {
      return;
    }
    return <ErrorDisplay error={email_body_error} />;
  }

  function render_email_textarea(): JSX.Element {
    return (
      <Input.TextArea
        defaultValue={email_body}
        autoSize={true}
        maxLength={1000}
        showCount={true}
        onBlur={() => {
          set_email_body_editing(false);
        }}
        onFocus={() => set_email_body_editing(true)}
        onChange={(e) => {
          const value: string = (e.target as any).value;
          set_email_body(value);
          check_email_body(value);
        }}
      />
    );
  }

  function render_send_email(): JSX.Element | undefined {
    if (!email_to) {
      return;
    }

    return (
      <div>
        <hr />
        <Well>
          Enter one or more email addresses separated by commas:
          <Input
            placeholder="Email addresses separated by commas..."
            value={email_to}
            onChange={(e) => set_email_to((e.target as any).value)}
            autoFocus
          />
          <div
            style={{
              border: "1px solid lightgrey",
              padding: "10px",
              borderRadius: "5px",
              backgroundColor: "white",
              marginBottom: "15px",
            }}
          >
            {render_email_body_error()}
            {render_email_textarea()}
          </div>
          <ButtonToolbar>
            <Button
              bsStyle="primary"
              onClick={send_email_invite}
              disabled={!!email_body_editing}
            >
              Send Invitation
            </Button>
            <Button
              onClick={() => {
                set_email_to("");
                set_email_body("");
                set_email_body_editing(false);
              }}
            >
              Cancel
            </Button>
          </ButtonToolbar>
        </Well>
      </div>
    );
  }

  function render_search(): JSX.Element | undefined {
    return (
      <div style={{ height: "40px" }}>
        {state == "searched"
          ? render_select_list_button()
          : "Who would you like to collaborate with?"}
      </div>
    );
  }

  function render_select_list(): JSX.Element | undefined {
    if (project == null) return;

    const users: User[] = [];
    const existing: User[] = [];
    for (const r of results) {
      if (project.get("users").get(r.account_id) != null) {
        existing.push(r);
      } else {
        users.push(r);
      }
    }

    function render_search_help(): JSX.Element | undefined {
      if (focused && results.length === 0) {
        return <Alert type="info" message={"Press enter to search..."} />;
      }
    }

    return (
      <div style={{ marginBottom: "10px" }}>
        <Select
          ref={select_ref}
          mode="multiple"
          allowClear
          showArrow
          autoFocus={autoFocus}
          open={autoFocus ? true : undefined}
          filterOption={(s, opt) => {
            if (s.indexOf(",") != -1) return true;
            return search_match(
              (opt as any).label,
              search_split(s.toLowerCase())
            );
          }}
          style={{ width: "100%", marginBottom: "10px" }}
          placeholder={
            results.length > 0 && search.trim() ? (
              `Select user from ${results.length} ${plural(
                results.length,
                "user"
              )} matching '${search}'.`
            ) : (
              <span>
                <Icon name="search" /> Name or email address...
              </span>
            )
          }
          onChange={(value) => {
            set_selected_entries(value as string[]);
          }}
          value={selected_entries}
          optionLabelProp="tag"
          onInputKeyDown={(e) => {
            if (e.keyCode == 27) {
              reset();
              e.preventDefault();
              return;
            }
            if (
              e.keyCode == 13 &&
              state != ("searching" as State) &&
              !hasMatches()
            ) {
              do_search(search_ref.current);
              e.preventDefault();
              return;
            }
          }}
          onSearch={(value) => (search_ref.current = value)}
          notFoundContent={null}
          onFocus={() => set_focused(true)}
          onBlur={() => set_focused(false)}
        >
          {render_options(users)}
        </Select>
        {render_search_help()}
        {selected_entries.length > 0 && (
          <div
            style={{
              border: "1px solid lightgrey",
              padding: "10px",
              borderRadius: "5px",
              backgroundColor: "white",
              margin: "10px 0",
            }}
          >
            {render_email_body_error()}
            {render_email_textarea()}
          </div>
        )}
        {state == "searched" && render_select_list_button()}
      </div>
    );
  }

  function hasMatches(): boolean {
    const s = search_split(search_ref.current.toLowerCase());
    if (s.length == 0) return true;
    for (const r of results) {
      if (r.label == null) continue;
      if (search_match(r.label, s)) {
        return true;
      }
    }
    return false;
  }

  function render_select_list_button(): JSX.Element | undefined {
    const number_selected = selected_entries.length;
    let label: string;
    let disabled: boolean;
    if (number_selected == 0 && results.length == 0) {
      label = "No matching users";
      if (num_matching_already > 0) {
        label += ` (${num_matching_already} matching ${plural(
          num_matching_already,
          "user"
        )} already added)`;
      }
      disabled = true;
    } else {
      if (number_selected == 0) {
        label = "Add selected user";
        disabled = true;
      } else if (number_selected == 1) {
        label = "Add selected user";
        disabled = false;
      } else {
        label = `Add ${number_selected} selected users`;
        disabled = false;
      }
    }
    if (email_body_error) {
      disabled = true;
    }
    return (
      <div>
        <Button onClick={reset}>Cancel</Button>
        <Space />
        <Button disabled={disabled} onClick={add_selected} bsStyle="primary">
          <Icon name="user-plus" /> {label}
        </Button>
      </div>
    );
  }

  function render_invite_result(): JSX.Element | undefined {
    if (state != "invited") {
      return;
    }
    return (
      <Alert
        style={{ margin: "5px 0" }}
        showIcon
        closable
        onClose={reset}
        type="success"
        message={invite_result}
      />
    );
  }

   if(student.disableCollaborators) {
    return <div></div>;
  }

  return (
    <div>
      {err && <ErrorDisplay error={err} onClose={() => set_err("")} />}
      {state == "searching" && <Loading />}
      {render_search()}
      {render_select_list()}
      {render_send_email()}
      {render_invite_result()}
      <ProjectInviteTokens project_id={project?.get("project_id")} />
    </div>
  );
};
