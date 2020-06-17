/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, Rendered } from "../app-framework";
import { Map } from "immutable";
import { webapp_client } from "../webapp-client";
import { Checkbox, Panel } from "../antd-bootstrap";
import { IS_MOBILE, IS_TOUCH } from "../feature";
import {
  A,
  Icon,
  NumberInput,
  LabeledRow,
  Loading,
  SelectorInput,
} from "../r_misc";
import { NEW_FILENAMES } from "smc-util/db-schema";
import { NewFilenameFamilies, NewFilenames } from "../project/utils";

import { set_account_table } from "./util";

interface Props {
  other_settings: Map<string, any>;
  is_stripe_customer: boolean;
}

export class OtherSettings extends Component<Props> {
  private on_change(name: string, value: any): void {
    set_account_table({ other_settings: { [name]: value } });
  }

  show_announcement(priority: string): void {
    this.on_change("notification_#{priority}", null);
  }

  private render_first_steps(): Rendered {
    return; // this is disabled elsewhere anyways...
    return (
      <Checkbox
        checked={!!this.props.other_settings.get("first_steps")}
        onChange={(e) => this.on_change("first_steps", e.target.checked)}
      >
        Offer to setup the "First Steps" guide (if available).
      </Checkbox>
    );
  }

  private render_announcement_info(): Rendered {
    return (
      <Button onClick={() => this.show_announcement("info")}>
        Show recent announcements
      </Button>
    );
  }

  private render_announcement_high(): Rendered {
    return (
      <Button onClick={() => this.show_announcement("high")}>
        Show recent system notifications
      </Button>
    );
  }

  private render_time_ago_absolute(): Rendered {
    return (
      <Checkbox
        checked={!!this.props.other_settings.get("time_ago_absolute")}
        onChange={(e) => this.on_change("time_ago_absolute", e.target.checked)}
      >
        Display timestamps as absolute points in time instead of relative to the
        current time.
      </Checkbox>
    );
  }

  private render_confirm(): Rendered {
    if (!IS_MOBILE) {
      return (
        <Checkbox
          checked={!!this.props.other_settings.get("confirm_close")}
          onChange={(e) => this.on_change("confirm_close", e.target.checked)}
        >
          Confirm: always ask for confirmation before closing the browser window
        </Checkbox>
      );
    }
  }

  private render_standby_timeout(): Rendered {
    if (IS_TOUCH) {
      return;
    }
    return (
      <LabeledRow label="Standby timeout">
        <NumberInput
          on_change={(n) => this.on_change("standby_timeout_m", n)}
          min={1}
          max={180}
          unit="minutes"
          number={this.props.other_settings.get("standby_timeout_m")}
        />
      </LabeledRow>
    );
  }

  private render_mask_files(): Rendered {
    return (
      <Checkbox
        checked={!!this.props.other_settings.get("mask_files")}
        onChange={(e) => this.on_change("mask_files", e.target.checked)}
      >
        Mask files: grey out files in the files viewer that you probably do not
        want to open
      </Checkbox>
    );
  }

  private render_default_file_sort(): Rendered {
    return (
      <LabeledRow label="Default file sort">
        <SelectorInput
          selected={this.props.other_settings.get("default_file_sort")}
          options={{ time: "Sort by time", name: "Sort by name" }}
          on_change={(value) => this.on_change("default_file_sort", value)}
        />
      </LabeledRow>
    );
  }

  private render_new_filenames(): Rendered {
    const selected =
      this.props.other_settings.get(NEW_FILENAMES) ??
      NewFilenames.default_family;
    return (
      <LabeledRow label="Generated filenames">
        <SelectorInput
          selected={selected}
          options={NewFilenameFamilies}
          on_change={(value) => this.on_change(NEW_FILENAMES, value)}
        />
      </LabeledRow>
    );
  }

  private render_page_size(): Rendered {
    return (
      <LabeledRow label="Number of files per page">
        <NumberInput
          on_change={(n) => this.on_change("page_size", n)}
          min={1}
          max={10000}
          number={this.props.other_settings.get("page_size")}
        />
      </LabeledRow>
    );
  }

  private render_no_free_warnings(): Rendered {
    let extra;
    if (!this.props.is_stripe_customer) {
      extra = <span>(only available to customers)</span>;
    } else {
      extra = <span>(thanks for being a customer)</span>;
    }
    return (
      <Checkbox
        disabled={!this.props.is_stripe_customer}
        checked={!!this.props.other_settings.get("no_free_warnings")}
        onChange={(e) => this.on_change("no_free_warnings", e.target.checked)}
      >
        Hide free warnings: do{" "}
        <b>
          <i>not</i>
        </b>{" "}
        show a warning banner when using a free trial project {extra}
      </Checkbox>
    );
  }

  private render_dark_mode(): Rendered {
    return (
      <Checkbox
        checked={!!this.props.other_settings.get("dark_mode")}
        onChange={(e) => this.on_change("dark_mode", e.target.checked)}
        style={{
          color: "rgba(229, 224, 216, 0.65)",
          backgroundColor: "rgb(36, 37, 37)",
          marginLeft: "-5px",
          padding: "5px",
          borderRadius: "3px",
        }}
      >
        Dark mode: reduce eye strain by showing a dark background (via{" "}
        <A href="https://darkreader.org/">Dark Reader</A>)
      </Checkbox>
    );
  }

  render() {
    if (this.props.other_settings == null) {
      return <Loading />;
    }
    return (
      <Panel
        header={
          <>
            <Icon name="gear" /> Other
          </>
        }
      >
        {this.render_confirm()}
        {this.render_time_ago_absolute()}
        {this.render_global_banner()}
        {this.render_mask_files()}
        {this.render_no_free_warnings()}
        {this.render_first_steps()}
        {this.render_dark_mode()}
        {this.render_new_filenames()}
        {this.render_default_file_sort()}
        {this.render_page_size()}
        {this.render_standby_timeout()}
      </Panel>
    );
  }
}
