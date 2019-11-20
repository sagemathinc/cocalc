/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

import misc from "smc-util/misc";

import * as underscore from "underscore";
import * as immutable from "immutable";
const TRUNC = 90;

import { React, ReactDOM, rtypes, rclass, redux } from "../../app-framework";

import { Grid, Col, Row, Button } from "react-bootstrap";

import {
  Icon,
  Loading,
  TimeAgo,
  PathLink,
  r_join,
  Space,
  Tip
} from "../../r_misc";
import { WindowedList } from "../../r_misc/windowed-list";
const { User } = require("../../users");
import { file_actions } from "../../project_store";
const { ProjectTitleAuto } = require("../../projects");
import { file_associations } from "../../file-associations";

import { LogSearch } from "./search";
import { SystemProcess } from "./system-process";

const selected_item = {
  backgroundColor: "#08c",
  color: "white"
};

const LogEntry = rclass({
  displayName: "ProjectLog-LogEntry",

  propTypes: {
    time: rtypes.object,
    event: rtypes.any,
    account_id: rtypes.string,
    user_map: rtypes.object,
    cursor: rtypes.bool,
    backgroundStyle: rtypes.object,
    project_id: rtypes.string
  },

  render_took() {
    if (!(this.props.event != null ? this.props.event.time : undefined)) {
      return;
    }
    return (
      <span style={{ color: "#666" }}>
        <Space />
        (took {(Math.round(this.props.event.time / 100) / 10).toFixed(1)}s)
      </span>
    );
  },

  render_open_file() {
    return (
      <span>
        opened
        <Space />
        <PathLink
          path={this.props.event.filename}
          full={true}
          style={this.props.cursor ? selected_item : undefined}
          trunc={TRUNC}
          project_id={this.props.project_id}
        />
        {this.render_took()}
      </span>
    );
  },

  render_start_project() {
    return <span>started this project {this.render_took()}</span>;
  },

  render_project_restart_requested() {
    return <span>requested to restart this project</span>;
  },

  render_project_stop_requested() {
    return <span>requested to stop this project</span>;
  },

  render_project_stopped() {
    return <span>stopped this project</span>;
  },

  render_miniterm_command(cmd) {
    if (cmd.length > 50) {
      return (
        <Tip title="Full command" tip={cmd} delayHide={10000} rootClose={true}>
          <kbd>{misc.trunc_middle(cmd, TRUNC)}</kbd>
        </Tip>
      );
    } else {
      return <kbd>{cmd}</kbd>;
    }
  },

  render_miniterm() {
    return (
      <span>
        executed mini terminal command{" "}
        {this.render_miniterm_command(this.props.event.input)}
      </span>
    );
  },

  project_title() {
    return (
      <ProjectTitleAuto
        style={this.props.cursor ? selected_item : undefined}
        project_id={this.props.event.project}
      />
    );
  },

  file_link(path, link, i, project_id) {
    return (
      <PathLink
        path={path}
        full={true}
        style={this.props.cursor ? selected_item : undefined}
        key={i}
        trunc={TRUNC}
        link={link}
        project_id={project_id != null ? project_id : this.props.project_id}
      />
    );
  },

  multi_file_links(link) {
    if (link == null) {
      link = true;
    }
    const links = [];
    for (let i = 0; i < this.props.event.files.length; i++) {
      const path = this.props.event.files[i];
      links.push(this.file_link(path, link, i));
    }
    return r_join(links);
  },

  to_link() {
    const e = this.props.event;
    if (e.project != null) {
      return this.project_title();
    } else if (e.dest != null) {
      return this.file_link(e.dest, true, 0);
    } else {
      return "???";
    }
  },

  render_file_action() {
    const e = this.props.event;
    switch (e != null ? e.action : undefined) {
      case "deleted":
        return (
          <span>
            deleted {this.multi_file_links(false)}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "downloaded":
        return (
          <span>
            downloaded{" "}
            {this.file_link(e.path != null ? e.path : e.files, true, 0)}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "moved":
        return (
          <span>
            moved {this.multi_file_links(false)}{" "}
            {e.count != null ? `(${e.count} total)` : ""} to {this.to_link()}
          </span>
        );
      case "copied":
        return (
          <span>
            copied {this.multi_file_links()}{" "}
            {e.count != null ? `(${e.count} total)` : ""} to {this.to_link()}
          </span>
        );
      case "shared":
        return (
          <span>
            shared {this.multi_file_links()}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "uploaded":
        return <span>uploaded {this.file_link(e.file, true, 0)}</span>;
    }
  },

  click_set(e) {
    e.preventDefault();
    return this.actions({ project_id: this.props.project_id }).set_active_tab(
      "settings"
    );
  },

  render_set(obj) {
    let i = 0;
    return (() => {
      const result = [];
      for (let key in obj) {
        const value = obj[key];
        i += 1;
        let content = `${key} to ${value}`;
        if (i < obj.length) {
          content += "<Space/>and";
        }
        result.push(
          <span key={i}>
            set{" "}
            <a
              onClick={this.click_set}
              style={this.props.cursor ? selected_item : undefined}
              href=""
            >
              {content}
            </a>
          </span>
        );
      }
      return result;
    })();
  },

  render_x11() {
    if (!this.props.event.action === "launch") {
      return;
    }
    return (
      <span>
        launched X11 app <code>{this.props.event.command}</code> in{" "}
        {this.file_link(this.props.event.path, true, 0)}
      </span>
    );
  },

  render_library() {
    if (this.props.event.target == null) {
      return;
    }
    return (
      <span>
        copied "{this.props.event.title}" from the library to{" "}
        {this.file_link(this.props.event.target, true, 0)}
      </span>
    );
  },

  render_assistant() {
    const e = this.props.event;
    switch (e != null ? e.action : undefined) {
      case "insert":
        var lang = misc.jupyter_language_to_name(e.lang);
        return (
          <span>
            used the <i>assistant</i> to insert the "{lang}" example {'"'}
            {e.entry.join(" → ")}
            {'"'}
            {" into "}
            <PathLink
              path={this.props.event.path}
              full={true}
              style={this.props.cursor ? selected_item : undefined}
              trunc={TRUNC}
              project_id={this.props.project_id}
            />
          </span>
        );
    }
  },

  render_upgrade() {
    const { params } = require("smc-util/schema").PROJECT_UPGRADES;
    let v = [];
    for (let param in this.props.event.upgrades) {
      const val = this.props.event.upgrades[param];
      const factor =
        (params[param] != null ? params[param].display_factor : undefined) !=
        null
          ? params[param] != null
            ? params[param].display_factor
            : undefined
          : 1;
      const unit =
        (params[param] != null ? params[param].display_unit : undefined) != null
          ? params[param] != null
            ? params[param].display_unit
            : undefined
          : "upgrade";
      const display =
        (params[param] != null ? params[param].display : undefined) != null
          ? params[param] != null
            ? params[param].display
            : undefined
          : "Upgrade";
      const n = misc.round1(val != null ? factor * val : 0);
      v.push(
        <span key={param}>
          {display}: {n} {misc.plural(n, unit)}
        </span>
      );
    }
    v = v.length > 0 ? r_join(v) : "nothing";
    return (
      <span>
        set{" "}
        <a
          onClick={this.click_set}
          style={this.props.cursor ? selected_item : undefined}
          href=""
        >
          upgrade contributions
        </a>{" "}
        to: {v}
      </span>
    );
  },

  render_invite_user() {
    return (
      <span>
        invited user{" "}
        <User
          user_map={this.props.user_map}
          account_id={this.props.event.invitee_account_id}
        />
      </span>
    );
  },

  render_invite_nonuser() {
    return <span>invited nonuser {this.props.event.invitee_email}</span>;
  },

  render_remove_collaborator() {
    return <span>removed collaborator {this.props.event.removed_name}</span>;
  },

  file_action_icons: {
    deleted: "delete",
    downloaded: "download",
    moved: "move",
    copied: "copy",
    share: "shared",
    uploaded: "upload"
  },

  render_desc() {
    if (typeof this.props.event === "string") {
      return <span>{this.props.event}</span>;
    }

    switch (this.props.event != null ? this.props.event.event : undefined) {
      case "start_project":
        return this.render_start_project();
      case "project_stop_requested":
        return this.render_project_stop_requested();
      case "project_restart_requested":
        return this.render_project_restart_requested();
      case "project_stopped":
        return this.render_project_stopped();
      case "open": // open a file
        return this.render_open_file();
      case "set":
        return this.render_set(misc.copy_without(this.props.event, "event"));
      case "miniterm":
        return this.render_miniterm();
      case "termInSearch":
        return this.render_miniterm();
      case "file_action":
        return this.render_file_action();
      case "upgrade":
        return this.render_upgrade();
      case "invite_user":
        return this.render_invite_user();
      case "invite_nonuser":
        return this.render_invite_nonuser();
      case "remove_collaborator":
        return this.render_remove_collaborator();
      case "open_project": // not used anymore???
        return <span>opened this project</span>;
      case "library":
        return this.render_library();
      case "assistant":
        return this.render_assistant();
      case "x11":
        return this.render_x11();
    }
  },
  // ignore unknown -- would just look mangled to user...
  //else
  // FUTURE:
  //    return <span>{misc.to_json(@props.event)}</span>

  render_user() {
    if (this.props.account_id != null) {
      return (
        <User
          user_map={this.props.user_map}
          account_id={this.props.account_id}
        />
      );
    } else {
      return <SystemProcess event={this.props.event} />;
    }
  },

  icon() {
    if (!(this.props.event != null ? this.props.event.event : undefined)) {
      return "dot-circle-o";
    }

    switch (this.props.event.event) {
      case "open_project":
        return "folder-open-o";
        break;
      case "open": // open a file
        var x =
          file_associations[this.props.event.type] != null
            ? file_associations[this.props.event.type].icon
            : undefined;
        if (x != null) {
          if (x.slice(0, 3) === "fa-") {
            // temporary -- until change code there?
            x = x.slice(3);
          }
          return x;
        } else {
          return "file-code-o";
        }
        break;
      case "set":
        return "wrench";
        break;
      case "file_action":
        var icon = this.file_action_icons[this.props.event.action];
        return file_actions[icon] != null ? file_actions[icon].icon : undefined;
        break;
      case "upgrade":
        return "arrow-circle-up";
        break;
      case "invite_user":
        return "user";
        break;
      case "invite_nonuser":
        return "user";
        break;
    }

    if (this.props.event.event.indexOf("project") !== -1) {
      return "edit";
    } else {
      return "dot-circle-o";
    }
  },

  render() {
    const style = this.props.cursor
      ? selected_item
      : this.props.backgroundStyle;
    return (
      <Grid fluid={true} style={{ width: "100%" }}>
        <Row
          style={underscore.extend(
            { borderBottom: "1px solid lightgrey" },
            style
          )}
        >
          <Col sm={1} style={{ textAlign: "center" }}>
            <Icon name={this.icon()} style={style} />
          </Col>
          <Col sm={11}>
            {this.render_user()}
            <Space />
            {this.render_desc()}
            <Space />
            <TimeAgo style={style} date={this.props.time} popover={true} />
          </Col>
        </Row>
      </Grid>
    );
  }
});

export const ProjectLog = rclass(function({ name }) {
  return {
    displayName: "ProjectLog",

    reduxProps: {
      [name]: {
        project_log: rtypes.immutable,
        project_log_all: rtypes.immutable,
        search: rtypes.string
      },
      users: {
        user_map: rtypes.immutable,
        get_name: rtypes.func
      }
    },

    propTypes: {
      project_id: rtypes.string.isRequired
    },

    getDefaultProps() {
      return { search: "" };
    }, // search that user has requested

    getInitialState() {
      // Temporarily sticking this here until we switch to typescript
      this.windowed_list_ref = React.createRef();

      return { cursor_index: 0 };
    },

    shouldComponentUpdate(nextProps, nextState) {
      if (this.state.cursor_index !== nextState.cursor_index) {
        return true;
      }
      if (this.props.search !== nextProps.search) {
        return true;
      }
      if (
        (this.props.project_log == null || nextProps.project_log == null) &&
        (this.props.project_log_all == null ||
          nextProps.project_log_all == null)
      ) {
        return true;
      }
      if (this.props.user_map == null || nextProps.user_map == null) {
        return true;
      }
      if (!nextProps.user_map.equals(this.props.user_map)) {
        return true;
      }
      if (nextProps.project_log != null) {
        return !nextProps.project_log.equals(this.props.project_log);
      }
      if (nextProps.project_log_all != null) {
        return !nextProps.project_log_all.equals(this.props.project_log_all);
      }
      return false;
    },

    componentWillReceiveProps(next, next_state) {
      if (
        next.user_map == null ||
        (next.project_log == null && next.project_log_all == null)
      ) {
        return;
      }
      if (
        !immutable.is(this.props.project_log, next.project_log) ||
        !immutable.is(this.props.project_log_all, next.project_log_all) ||
        this.props.search !== next.search
      ) {
        return delete this._log;
      }
    },

    get_log() {
      if (this._log != null) {
        return this._log;
      }
      let v =
        this.props.project_log_all != null
          ? this.props.project_log_all
          : this.props.project_log;
      if (v == null) {
        this._log = immutable.List();
        return this._log;
      }

      v = v.valueSeq();
      if (this.props.search) {
        if (this._search_cache == null) {
          this._search_cache = {};
        }
        const terms = misc.search_split(this.props.search.toLowerCase());
        const names = {};
        const match = z => {
          let s = this._search_cache[z.get("id")];
          if (s == null) {
            let name1;
            s =
              names[(name1 = z.get("account_id"))] != null
                ? names[name1]
                : (names[name1] = this.props.get_name(z.get("account_id")));
            const event = z.get("event");
            if (event != null) {
              event.forEach((val, k) => {
                if (k !== "event" && k !== "filename") {
                  s += " " + k;
                }
                if (k === "type") {
                  return;
                }
                s += " " + val;
              });
            }
            s = s.toLowerCase();
            this._search_cache[z.get("id")] = s;
          }
          return misc.search_match(s, terms);
        };
        v = v.filter(match);
      }
      v = v.sort((a, b) => b.get("time") - a.get("time"));

      return (this._log = v);
    },

    move_cursor_to(cursor_index) {
      if (cursor_index < 0 || cursor_index >= this.get_log().size) {
        return;
      }
      this.setState({ cursor_index });
      return this.windowed_list_ref.current != null
        ? this.windowed_list_ref.current.scrollToRow(cursor_index)
        : undefined;
    },

    increment_cursor() {
      return this.move_cursor_to(this.state.cursor_index + 1);
    },

    decrement_cursor() {
      return this.move_cursor_to(this.state.cursor_index - 1);
    },

    reset_cursor() {
      return this.move_cursor_to(0);
    },

    load_all() {
      this._next_cursor_pos = this.get_log().size - 1;
      delete this._last_project_log;
      delete this._last_user_map;
      delete this._loading_table;
      return this.actions(name).project_log_load_all();
    },

    render_load_all_button() {
      if (this.props.project_log_all != null) {
        return;
      }
      return (
        <Button
          bsStyle={"info"}
          onClick={this.load_all}
          disabled={this.props.project_log_all != null}
        >
          Load older log entries
        </Button>
      );
    },

    focus_search_box() {
      const { input } = this.refs.search.refs.box.refs;
      return ReactDOM.findDOMNode(input).focus();
    },

    row_renderer(index) {
      const log = this.get_log();
      if (index === log.size) {
        return this.render_load_all_button();
      }
      const x = log.get(index);
      if (x == null) {
        return;
      }
      return (
        <LogEntry
          cursor={this.state.cursor_index === index}
          time={x.get("time")}
          event={x.get("event", immutable.Map()).toJS()}
          account_id={x.get("account_id")}
          user_map={this.props.user_map}
          backgroundStyle={
            index % 2 === 0 ? { backgroundColor: "#eee" } : undefined
          }
          project_id={this.props.project_id}
        />
      );
    },

    row_key(index) {
      return `${index}`;
    },

    render_log_entries() {
      const next_cursor_pos = this._next_cursor_pos;
      if (this._next_cursor_pos) {
        delete this._next_cursor_pos;
      }
      return (
        <WindowedList
          ref={this.windowed_list_ref}
          overscan_row_count={20}
          estimated_row_size={22}
          row_count={this.get_log().size + 1}
          row_renderer={x => this.row_renderer(x.index)}
          row_key={this.row_key}
          scroll_to_index={next_cursor_pos}
          cache_id={"project_log" + this.props.project_id}
        />
      );
    },

    render_log_panel() {
      return (
        <div
          className="smc-vfill"
          style={{ border: "1px solid #ccc", borderRadius: "3px" }}
        >
          {this.render_log_entries()}
        </div>
      );
    },

    render_body() {
      if (!this.props.project_log && !this.props.project_log_all) {
        if (!this._loading_table) {
          this._loading_table = true;
          // The project log not yet loaded, so kick off the load.
          // This is safe to call multiple times and is done so that the
          // changefeed for the project log is only setup if the user actually
          // looks at the project log at least once.
          redux
            .getProjectStore(this.props.project_id)
            .init_table("project_log");
        }
        return <Loading theme={"medium"} />;
      }
      this._loading_table = false;
      return this.render_log_panel();
    },

    render_search() {
      return (
        <LogSearch
          ref={"search"}
          actions={this.actions(name)}
          search={this.props.search}
          selected={this.get_log().get(this.state.cursor_index)}
          increment_cursor={this.increment_cursor}
          decrement_cursor={this.decrement_cursor}
          reset_cursor={this.reset_cursor}
        />
      );
    },

    render() {
      return (
        <div style={{ padding: "15px" }} className={"smc-vfill"}>
          <h1 style={{ marginTop: "0px" }}>
            <Icon name="history" /> Project activity log
          </h1>
          {this.render_search()}
          {this.render_body()}
        </div>
      );
    }
  };
});
