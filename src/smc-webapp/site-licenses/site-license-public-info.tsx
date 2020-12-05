/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromJS, Map } from "immutable";
import {
  React,
  useEffect,
  useIsMountedRef,
  useState,
  useTypedRedux,
  redux,
} from "../app-framework";
import { SiteLicensePublicInfo as Info } from "./types";
import { site_license_public_info } from "./util";
import { CopyToClipBoard, Icon, Loading, Space, TimeAgo } from "../r_misc";
import { alert_message } from "../alerts";
import { Alert, Button, Input, Popconfirm } from "antd";
import { DisplayUpgrades, scale_by_display_factors } from "./admin/upgrades";
import { plural, trunc_left } from "smc-util/misc";
import { DebounceInput } from "react-debounce-input";
import { webapp_client } from "../webapp-client";
import { describe_quota } from "smc-util/db-schema/site-licenses";
import { LicensePurchaseInfo } from "./purchase-info-about-license";
import { query, user_search } from "../frame-editors/generic/client";
import { User } from "../users";

interface Props {
  license_id: string;
  project_id?: string; // if not given, just provide the public info about the license (nothing about if it is upgrading a specific project or not) -- this is used, e.g., for the course configuration page
  upgrades?: Map<string, number>;
  onRemove?: () => void;
  warn_if?: (info) => void | string;
}

export const SiteLicensePublicInfo: React.FC<Props> = ({
  license_id,
  project_id,
  upgrades,
  onRemove,
  warn_if,
}) => {
  const [info, set_info] = useState<Info | undefined>(undefined);
  const [err, set_err] = useState<string | undefined>(undefined);
  const [loading, set_loading] = useState<boolean>(true);
  const isMountedRef = useIsMountedRef();
  const [is_editing_description, set_is_editing_description] = useState<
    boolean
  >(false);
  const [is_editing_title, set_is_editing_title] = useState<boolean>(false);
  const [title, set_title] = useState<string>("");
  const [description, set_description] = useState<string>("");
  const [is_adding_manager, set_is_adding_manager] = useState<boolean>(false);
  const [manager_search, set_manager_search] = useState<string>("");
  const [manager_search_result, set_manager_search_result] = useState<
    | false
    | undefined
    | {
        first_name?: string;
        last_name?: string;
        account_id: string;
        last_active?: Date;
      }
  >(false);
  const user_map = useTypedRedux("users", "user_map");

  useEffect(() => {
    // Optimization: check in redux store for first approximation of
    // info already available locally
    let info = redux
      .getStore("billing")
      .getIn(["managed_licenses", license_id]);
    if (info != null) {
      const info2 = info.toJS() as Info;
      info2.is_manager = true; // redux store *only* has entries that are managed.
      set_info(info2);
    }
    // Now launch async fetch from database.  This has more info, e.g., number of
    // projects that are running right now.
    fetch_info(true);
  }, []);

  async function set_managers(managers: string[]): Promise<void> {
    await query({
      query: { manager_site_licenses: { id: license_id, managers } },
    });
  }

  async function do_add_manager(account_id: string): Promise<void> {
    if (info?.managers == null) return;
    try {
      if (info.managers.indexOf(account_id) == -1) {
        info.managers.push(account_id);
        await set_managers(info.managers);
        if (!isMountedRef.current) return;
      }
      alert_message({
        type: "info",
        message: "Successfully added manager to license.",
      });
      fetch_info(true);
    } catch (err) {
      const message = `Error adding manager to license -- ${err}`;
      alert_message({ type: "error", message });
    }
  }

  async function do_remove_manager(account_id: string): Promise<void> {
    if (info?.managers == null) return;
    try {
      if (info.managers.indexOf(account_id) != -1) {
        info.managers = info.managers.filter((x) => x != account_id);
        await set_managers(info.managers);
        if (!isMountedRef.current) return;
      }
      alert_message({
        type: "info",
        message: "Successfully removed manager from license.",
      });
      fetch_info(true);
    } catch (err) {
      const message = `Error removing manager from license -- ${err}`;
      alert_message({ type: "error", message });
    }
  }

  async function add_manager(): Promise<void> {
    set_is_adding_manager(false);
    const query = manager_search;
    set_manager_search("");
    if (!info?.managers) return;
    // We find the first match that is NOT already a manager.
    // This is just to make the UI really simple for now (not having
    // to choose from multiple matches).
    const x = await user_search({
      query,
      limit: info.managers.length + 1 ?? 1,
    });
    if (!isMountedRef.current || !info?.managers) return;
    for (const y of x) {
      if (info.managers.indexOf(y.account_id) == -1) {
        // not already a manager
        set_manager_search_result(y);
        return;
      }
    }
    set_manager_search_result(undefined);
  }

  async function fetch_info(force: boolean = false): Promise<void> {
    set_err("");
    set_loading(true);
    let info;
    let success = false;
    try {
      info = await site_license_public_info(license_id, force);
      success = true;
    } catch (err) {
      if (!isMountedRef.current) return;
      set_err(`${err}`);
    } finally {
      if (!isMountedRef.current) return;
      set_loading(false);
      if (success) {
        set_info(info);
      }
    }
  }

  function render_expires(): JSX.Element | undefined {
    if (!info?.expires) return;
    let word: string = new Date() >= info.expires ? "expired" : "will expire";
    return (
      <span>
        {" "}
        ({word} <TimeAgo date={info.expires} />)
      </span>
    );
  }

  function get_type(): "warning" | "error" | "success" {
    if (loading || info != null) {
      if (provides_upgrades()) {
        return "success";
      } else {
        return "warning";
      }
    } else {
      return "error";
    }
  }

  function render_id(): JSX.Element | undefined {
    if (!license_id) return;
    // dumb minimal security -- only show this for now to managers.
    // Of course, somebody could
    // sniff their browser traffic and get it so this is just to
    // discourage really trivial blatant misuse.  We will have other
    // layers of security.

    // Show only last few digits if not manager.
    // license display for specific project
    return (
      <li>
        {info?.is_manager ? (
          <CopyToClipBoard
            style={{ display: "inline-block", width: "50ex", margin: 0 }}
            value={license_id}
          />
        ) : (
          <span style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
            {trunc_left(license_id, 14)}
          </span>
        )}
      </li>
    );
  }

  function render_license(): JSX.Element | undefined {
    if (!info) {
      if (!loading && !err) {
        return <span>Unknown license key.</span>;
      }
      return;
    }
    return (
      <span>
        {render_title()}
        {render_expires()}
      </span>
    );
  }

  function provides_upgrades(): boolean {
    return upgrades != null && upgrades.size > 0;
  }

  function render_run_limit(): JSX.Element | undefined {
    if (!info) return;
    if (!info.run_limit) {
      return (
        <li>
          License can be used with an unlimited number of simultaneous running
          projects.
        </li>
      );
    }
    return (
      <li>
        License can be used with up to {info.run_limit} simultaneous running
        projects.
      </li>
    );
  }

  function render_running(): JSX.Element | undefined {
    if (info?.running == null) return;
    return (
      <li>
        License is being actively used by {info.running} running{" "}
        {plural(info.running, "project")}.
      </li>
    );
  }

  function render_applied(): JSX.Element | undefined {
    if (info?.applied == null) return;
    return (
      <li>
        License is applied to {info.applied} {plural(info.applied, "project")}.
      </li>
    );
  }

  function render_overall_limit(): JSX.Element | undefined {
    if (!info) return;
    if (!info.run_limit) {
      return (
        <span>to an unlimited number of simultaneous running projects</span>
      );
    }
    return <span>to up to {info.run_limit} simultaneous running projects</span>;
  }

  function render_what_license_provides_overall(): JSX.Element | undefined {
    if (info == null) return;
    if (info.quota != null) {
      return render_quota(info.quota);
    }
    if (info.upgrades?.quota != null) {
      return render_quota(info.upgrades.quota);
    }
    if (!info.upgrades) return <div>Provides no upgrades.</div>;
    return (
      <div>
        Provides the following upgrades {render_overall_limit()}:
        <DisplayUpgrades
          upgrades={scale_by_display_factors(fromJS(info.upgrades))}
          style={{
            border: "1px solid #ddd",
            padding: "0 15px",
            backgroundColor: "white",
            margin: "5px 15px",
          }}
        />
      </div>
    );
  }

  function render_quota(quota): JSX.Element {
    return <div>{describe_quota(quota)}</div>;
  }

  function restart_project(): void {
    if (!project_id) return;
    const actions = redux.getActions("projects");
    actions.restart_project(project_id);
  }

  function render_upgrades(): JSX.Element | undefined {
    if (!project_id) {
      // component not being used in the context of a specific project.
      return (
        <div>
          {render_id()}
          {render_what_license_provides_overall()}
          {render_applied()}
          {render_run_limit()}
          {render_running()}
          {render_activated()}
          {render_purchased()}
          {render_managers()}
          {render_description()}
        </div>
      );
    }

    let provides: JSX.Element | undefined;
    let show_run: boolean = true;
    if (info == null) {
      if (loading) {
        return; // wait until done loading.
      } else {
        // Show just the id so user can check for typos
        return <ul>{render_id()}</ul>;
      }
    }
    if (info.expires && new Date() >= info.expires) {
      // expired?
      // it is expired, so no point in explaining what upgrades it would
      // provide or telling you to restart your project.
      provides = <li>License is expired.</li>;
      show_run = false; // no point in showing these
    } else if (!provides_upgrades()) {
      // not providing any upgrades -- tell them why
      if (info.running == null) {
        // not loaded yet...
        provides = <li>Currently providing no upgrades to this project. </li>;
      } else {
        if (!info.run_limit || info.running < info.run_limit) {
          provides = (
            <>
              <li>Currently providing no upgrades to this project. </li>
              <li>
                <Icon name="sync" />{" "}
                <a onClick={restart_project}>Restart this project</a> to use the
                upgrades provided by this license
                {info?.quota ? " - " + describe_quota(info.quota) : "."}
              </li>
            </>
          );
        } else {
          provides = (
            <>
              <li>Currently providing no upgrades to this project.</li>
              <li>
                <Icon name="warning" /> License is already being used to upgrade{" "}
                {info.running} other running projects, which is the limit. If
                possible, stop one of those projects, then{" "}
                <a onClick={restart_project}>restart this project.</a>
              </li>
            </>
          );
        }
      }
    } else {
      // not expired and is providing upgrades.
      if (upgrades == null) throw Error("make typescript happy");
      if (upgrades.has("quota")) {
        provides = (
          <li>{render_quota((upgrades.get("quota") as any)?.toJS())}</li>
        );
      } else {
        provides = (
          <li>
            Currently providing the following {plural(upgrades.size, "upgrade")}
            :
            <DisplayUpgrades
              upgrades={scale_by_display_factors(upgrades)}
              style={{
                border: "1px solid #ddd",
                padding: "0 15px",
                backgroundColor: "white",
                margin: "5px 15px",
              }}
            />
          </li>
        );
      }
    }
    return (
      <ul>
        {render_id()}
        {provides}
        {show_run && render_applied()}
        {show_run && render_run_limit()}
        {show_run && render_running()}
        {render_activated()}
        {render_purchased()}
        {render_managers()}
        {render_description()}
      </ul>
    );
  }

  function render_body(): JSX.Element | undefined {
    if (loading) {
      return <Loading style={{ display: "inline" }} />;
    } else {
      return render_license();
    }
  }

  async function remove_license(): Promise<void> {
    if (onRemove != null) {
      onRemove();
    }
    if (!project_id) return;
    const actions = redux.getActions("projects");
    // newly added licenses
    try {
      await actions.remove_site_license_from_project(project_id, license_id);
    } catch (err) {
      alert_message({
        type: "error",
        message: `Unable to add license key -- ${err}`,
      });
      return;
    }
  }

  function render_refresh_button(): JSX.Element {
    return (
      <Button onClick={() => fetch_info(true)}>
        <Icon name="redo" />
        <Space /> Refresh
      </Button>
    );
  }

  function render_remove_button(): JSX.Element | undefined {
    if (!project_id && onRemove == null) return;
    const extra = provides_upgrades() ? (
      <>
        <br />
        The project will no longer get upgraded using this license, and it may
        restart.
      </>
    ) : undefined;
    return (
      <Popconfirm
        title={
          <div>
            Are you sure you want to remove this license from the project?
            {extra}
          </div>
        }
        onConfirm={remove_license}
        okText={"Remove"}
        cancelText={"Cancel"}
      >
        <Button>
          <Icon name="times" />
          <Space /> Remove...
        </Button>
      </Popconfirm>
    );
  }

  // render information about when the license was activated
  function render_activated(): JSX.Element | undefined {
    const activates = info?.activates;
    if (activates == null) return;
    if (activates > new Date()) {
      return (
        <li style={{ fontWeight: "bold" }}>
          Will activate <TimeAgo date={activates} />
        </li>
      );
    } else {
      return (
        <li>
          Activated <TimeAgo date={activates} />
        </li>
      );
    }
  }

  // render information about when and how the license was purchased
  function render_purchased(): JSX.Element | undefined {
    if (!info?.is_manager) return; // definitely didn't purchase this license
    return <LicensePurchaseInfo license_id={license_id} />;
  }

  function render_title(): JSX.Element | undefined {
    if (is_editing_title) {
      return (
        <DebounceInput
          style={{ width: "50%" }}
          element={Input as any}
          placeholder={"Title"}
          value={title}
          onChange={(e) => set_title(e.target.value)}
          onBlur={async () => {
            if (title == info?.title) {
              set_is_editing_title(false);
            }
            const query = {
              manager_site_licenses: {
                id: license_id,
                title,
              },
            };
            await webapp_client.query({ query });
            if (!isMountedRef.current) return;
            await fetch_info(true);
            if (!isMountedRef.current) return;
            set_is_editing_title(false);
          }}
        />
      );
    }
    if (!info?.title) {
      if (!info?.is_manager) return;
      return (
        <Button
          style={{ marginBottom: "5px" }}
          onClick={() => {
            set_is_editing_title(true);
            set_title(info?.title);
          }}
        >
          Set title...
        </Button>
      );
    }
    return (
      <div
        style={{
          whiteSpace: "pre-wrap",
          border: "1px solid lightgrey",
          background: "white",
          padding: "4px 11px",
          display: "inline-block",
          margin: "5px 0",
        }}
        onClick={
          info?.is_manager
            ? () => {
                set_is_editing_title(true);
                set_title(info?.title);
              }
            : undefined
        }
      >
        {info?.title}
      </div>
    );
  }

  function render_description(): JSX.Element | undefined {
    if (is_editing_description) {
      return (
        <DebounceInput
          autoSize={{ minRows: 1, maxRows: 6 }}
          element={Input.TextArea as any}
          placeholder={"Description"}
          value={description}
          onChange={(e) => set_description(e.target.value)}
          onBlur={async () => {
            if (description == info?.description) {
              set_is_editing_description(false);
            }
            const query = {
              manager_site_licenses: {
                id: license_id,
                description,
              },
            };
            await webapp_client.query({ query });
            set_is_editing_description(false);
            if (!isMountedRef.current) return;
            await fetch_info(true);
            if (!isMountedRef.current) return;
          }}
        />
      );
    }
    if (!info?.description) {
      if (!info?.is_manager) return;
      return (
        <Button
          onClick={() => {
            set_is_editing_description(true);
            set_description(info?.description);
          }}
        >
          Set description...
        </Button>
      );
    }
    return (
      <li
        style={{
          whiteSpace: "pre-wrap",
          border: "1px solid lightgrey",
          background: "white",
          padding: "4px 11px",
        }}
        onClick={
          info?.is_manager
            ? () => {
                set_is_editing_description(true);
                set_description(info?.description);
              }
            : undefined
        }
      >
        {info?.description}
      </li>
    );
  }

  function render_err(): JSX.Element | undefined {
    if (err) {
      return (
        <div>
          <br />
          {err}
        </div>
      );
    }
  }

  function render_warning(): JSX.Element | undefined {
    if (warn_if == null || info == null) return;
    const s = warn_if(info);
    if (!s) return;
    return (
      <div>
        <hr />
        {s}
      </div>
    );
  }

  function render_add_search_result(): JSX.Element | undefined {
    if (manager_search_result === false) {
      return;
    }
    if (manager_search_result === undefined) {
      return (
        <div>
          No user found{" "}
          <Button onClick={() => set_manager_search_result(false)}>OK</Button>
        </div>
      );
    }
    const active = manager_search_result.last_active ? (
      <>
        {" "}
        (last active <TimeAgo date={manager_search_result.last_active} />)
      </>
    ) : (
      " (created account, but never used it)"
    );
    return (
      <div
        style={{
          background: "white",
          border: "1px solid grey",
          padding: "5px",
          margin: "15px",
        }}
      >
        Add{" "}
        <b>
          {manager_search_result.first_name ?? ""}{" "}
          {manager_search_result.last_name ?? ""}
        </b>
        {active}?
        <br />
        <Button
          onClick={() => {
            set_manager_search_result(false);
            do_add_manager(manager_search_result.account_id);
          }}
        >
          Add
        </Button>{" "}
        <Button onClick={() => set_manager_search_result(false)}>Cancel</Button>
      </div>
    );
  }

  function render_add_manager(): JSX.Element {
    if (is_adding_manager) {
      return (
        <span>
          ,{" "}
          <Input
            autoFocus
            placeholder="Email address or name..."
            style={{ width: "auto" }}
            value={manager_search}
            onChange={(e) => {
              set_manager_search(e.target.value);
            }}
          />{" "}
          <Button disabled={!manager_search} onClick={add_manager}>
            Search
          </Button>{" "}
          <Button
            onClick={() => {
              set_manager_search("");
              set_is_adding_manager(false);
            }}
          >
            Cancel
          </Button>
        </span>
      );
    } else {
      return (
        <a onClick={() => set_is_adding_manager(true)}>
          , <Icon name="plus-circle" /> New...
        </a>
      );
    }
  }

  function render_manager(account_id: string): JSX.Element | void {
    if (account_id == redux.getStore("account").get("account_id")) return;
    return (
      <span key={account_id}>
        ,{" "}
        <Popconfirm
          title={
            <>
              Remove manager{" "}
              <b>
                <User account_id={account_id} user_map={user_map} />?
              </b>
              <br />
              They will no longer see this license listed under licenses they
              manage.
              <br /> License will <i>not</i> be automatically removed from any
              projects they applied it to.
            </>
          }
          onConfirm={() => do_remove_manager(account_id)}
          okText={"Remove"}
          cancelText={"Cancel"}
        >
          <a>
            <User account_id={account_id} user_map={user_map} />
          </a>
        </Popconfirm>
      </span>
    );
  }

  function render_managers(): JSX.Element | undefined {
    if (!info?.is_manager || !info.managers) return; // only show info about managers to managers
    return (
      <li key="managers">
        {plural(info.managers.length, "Manager")}: You
        {info.managers.map(render_manager)}
        {render_add_manager()}
        {render_add_search_result()}
      </li>
    );
  }

  const message = (
    <div>
      <Button.Group style={{ float: "right" }}>
        {render_refresh_button()}
        {render_remove_button()}
      </Button.Group>
      {project_id != null && (
        <Icon style={{ marginRight: "15px" }} name="key" />
      )}
      {render_body()}
      <br />
      {render_upgrades()}
      {render_err()}
      {render_warning()}
    </div>
  );
  return (
    <Alert
      style={{ marginTop: "5px", minHeight: "48px" }}
      message={message}
      type={get_type()}
    />
  );
};
