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
  redux,
} from "../app-framework";
import { SiteLicensePublicInfo as Info } from "./types";
import { site_license_public_info } from "./util";
import { CopyToClipBoard, Icon, Loading, Space, TimeAgo } from "../r_misc";
import { alert_message } from "../alerts";
import { Alert, Button, Popconfirm } from "antd";
import { DisplayUpgrades, scale_by_display_factors } from "./admin/upgrades";
import { plural, trunc_left } from "smc-util/misc2";

interface Props {
  license_id: string;
  project_id?: string; // if not given, just provide the public info about the license (nothing about if it is upgrading a specific project or not) -- this is used, e.g., for the course configuration page
  upgrades?: Map<string, number>;
  onRemove?: () => void;
}

export const SiteLicensePublicInfo: React.FC<Props> = ({
  license_id,
  project_id,
  upgrades,
  onRemove,
}) => {
  const [info, set_info] = useState<Info | undefined>(undefined);
  const [err, set_err] = useState<string | undefined>(undefined);
  const [loading, set_loading] = useState<boolean>(true);
  const isMountedRef = useIsMountedRef();

  useEffect(() => {
    // Optimization: check in redux store for first approximation of
    // info already available locally
    let info = redux
      .getStore("billing")
      .getIn(["managed_licenses", license_id]);
    if (info != null) {
      const info2 = info.toJS() as Info;
      info2.is_manager = true;
      set_info(info2);
    }
    // Now launch async fetch from database.  This has more info, e.g., number of
    // projects that are running right now.
    fetch_info(true);
  }, []);

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
    if (!info) return;
    if (!info.expires) {
      return <span> (no expiration date set)</span>;
    }
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
        License code:
        <Space />
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
        {info.title}
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
          This license can be applied to an unlimited number of simultaneous
          running projects.
        </li>
      );
    }
    return (
      <li>
        This license can be applied to up to {info.run_limit} simultaneous
        running projects.
      </li>
    );
  }

  function render_running(): JSX.Element | undefined {
    if (!info || info.running == null) return;
    return (
      <li>
        Currently {info.running}{" "}
        {info.running == 1 ? "project is" : "projects are"} using this license.
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
    if (!info) return;
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
          {render_run_limit()}
          {render_running()}
          {render_activated()}
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
      provides = <li>This license is expired.</li>;
      show_run = false; // no point in showing these
    } else if (!provides_upgrades()) {
      // not providing any upgrades -- why?
      if (info.running == null) {
        // not loaded yet...
        provides = <li>Currently providing no upgrades to this project. </li>;
      } else {
        if (!info.run_limit || info.running < info.run_limit) {
          provides = (
            <>
              <li>Currently providing no upgrades to this project. </li>
              <li>
                <Icon name="warning" />{" "}
                <a onClick={restart_project}>Restart this project</a> to use the
                upgrades provided by this license.
              </li>
            </>
          );
        } else {
          provides = (
            <>
              <li>Currently providing no upgrades to this project.</li>
              <li>
                <Icon name="warning" /> This license is already being used to
                upgrade {info.running} other running projects, which is the
                limit. If possible, stop one of those projects, then{" "}
                <a onClick={restart_project}>restart this project.</a>
              </li>
            </>
          );
        }
      }
    } else {
      // not expired and is providing upgrades.
      if (upgrades == null) throw Error("make typescript happy");
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
    return (
      <ul>
        {render_id()}
        {provides}
        {show_run ? render_run_limit() : undefined}
        {show_run ? render_running() : undefined}
        {render_activated()}
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
        okText={"Yes"}
        cancelText={"Cancel"}
      >
        <Button>
          <Icon name="times" />
          <Space /> Remove...
        </Button>
      </Popconfirm>
    );
  }

  function render_activated(): JSX.Element | undefined {
    const activates = info?.activates;
    if (activates == null) return;
    if (activates > new Date()) {
      return (
        <li style={{ fontWeight: "bold" }}>
          Will activate <TimeAgo date={activates} />.
        </li>
      );
    } else {
      return (
        <li>
          Activated <TimeAgo date={activates} />.
        </li>
      );
    }
  }

  function render_description(): JSX.Element | undefined {
    const description = info?.description;
    if (!description) return;
    return <li>Description: {description}</li>;
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

  const message = (
    <div>
      <Button.Group style={{ float: "right" }}>
        {render_refresh_button()}
        {render_remove_button()}
      </Button.Group>
      <Icon name="key" /> {render_body()}
      <br />
      {render_upgrades()}
      {render_err()}
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
