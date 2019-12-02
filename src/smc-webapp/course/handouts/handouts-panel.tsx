//#############################################################################
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

// CoCalc libraries
import * as misc from "smc-util/misc";

// React Libraries
import {
  React,
  rtypes,
  Component,
  rclass,
  Rendered,
  redux
} from "../../app-framework";

import {
  Alert,
  Button,
  ButtonToolbar,
  ButtonGroup,
  FormGroup,
  FormControl
} from "react-bootstrap";

import { Card, Row, Col } from "cocalc-ui";

// CoCalc and course components
import * as util from "../util";
import * as styles from "../styles";
import { BigTime, FoldersToolbar } from "../common";
import {
  HandoutsMap,
  StudentsMap,
  HandoutRecord,
  CourseStore,
  LastCopyInfo
} from "../store";
import { UserMap } from "../../todo-types";
import { Set } from "immutable";
import { CourseActions } from "../actions";
import {
  ErrorDisplay,
  Icon,
  Tip,
  MarkdownInput,
  WindowedList
} from "../../r_misc";

// Could be merged with steps system of assignments.
// Probably not a good idea mixing the two.
// Could also be coded into the components below but steps could be added in the future?
const STEPS = () => ["handout"];

const step_direction = function(step) {
  switch (step) {
    case "handout":
      return "to";
    default:
      return console.warn(`BUG! step_direction('${step}')`);
  }
};

const step_verb = function(step) {
  switch (step) {
    case "handout":
      return "distribute";
    default:
      return console.warn(`BUG! step_verb('${step}')`);
  }
};

const step_ready = function(step) {
  switch (step) {
    case "handout":
      return "";
  }
};

const past_tense = function(word) {
  if (word[word.length - 1] === "e") {
    return word + "d";
  } else {
    return word + "ed";
  }
};

interface HandoutsPanelReactProps {
  frame_id?: string;
  name: string;
  actions: CourseActions;
  project_id: string;
  handouts: HandoutsMap; // handout_id -> handout
  students: StudentsMap; // student_id -> student
  user_map: UserMap;
}

interface HandoutsPanelReduxProps {
  expanded_handouts: Set<string>;
}

interface HandoutsPanelState {
  show_deleted: boolean;
  search: string; // Search value for filtering handouts
}

export const HandoutsPanel = rclass<HandoutsPanelReactProps>(
  class HandoutsPanel extends Component<
    HandoutsPanelReactProps & HandoutsPanelReduxProps,
    HandoutsPanelState
  > {
    constructor(props) {
      super(props);
      this.state = {
        show_deleted: false,
        search: ""
      };
    }

    static reduxProps({ name }) {
      return {
        [name]: {
          expanded_handouts: rtypes.immutable.Set
        }
      };
    }

    // Update on different students, handouts, or filter parameters
    public shouldComponentUpdate(nextProps, nextState): boolean {
      if (
        nextProps.handouts !== this.props.handouts ||
        nextProps.students !== this.props.students ||
        this.props.expanded_handouts !== nextProps.expanded_handouts
      ) {
        return true;
      }
      if (!misc.is_equal(nextState, this.state)) {
        return true;
      }
      return false;
    }

    private get_handout(id: string): HandoutRecord {
      const handout = this.props.handouts.get(id);
      if (handout == undefined) {
        console.warn(`Tried to access undefined handout ${id}`);
      }
      return handout as any;
    }

    private compute_handouts_list() {
      let deleted, num_deleted, num_omitted;
      let list = util.immutable_to_list(this.props.handouts, "handout_id");

      ({ list, num_omitted } = util.compute_match_list({
        list,
        search_key: "path",
        search: this.state.search.trim()
      }));

      ({ list, deleted, num_deleted } = util.order_list({
        list,
        compare_function: (a, b) =>
          misc.cmp(
            a.path != null ? a.path.toLowerCase() : undefined,
            b.path != null ? b.path.toLowerCase() : undefined
          ),
        reverse: false,
        include_deleted: this.state.show_deleted
      }));

      return {
        shown_handouts: list,
        deleted_handouts: deleted,
        num_omitted,
        num_deleted
      };
    }

    private render_show_deleted_button(num_deleted, num_shown): Rendered {
      if (this.state.show_deleted) {
        return (
          <Button
            style={styles.show_hide_deleted({ needs_margin: num_shown > 0 })}
            onClick={() => this.setState({ show_deleted: false })}
          >
            <Tip
              placement="left"
              title="Hide deleted"
              tip="Handouts are never really deleted.  Click this button so that deleted handouts aren't included at the bottom of the list."
            >
              Hide {num_deleted} deleted handouts
            </Tip>
          </Button>
        );
      } else {
        return (
          <Button
            style={styles.show_hide_deleted({ needs_margin: num_shown > 0 })}
            onClick={() => this.setState({ show_deleted: true, search: "" })}
          >
            <Tip
              placement="left"
              title="Show deleted"
              tip="Handouts are not deleted forever even after you delete them.  Click this button to show any deleted handouts at the bottom of the list of handouts.  You can then click on the handout and click undelete to bring the handout back."
            >
              Show {num_deleted} deleted handouts
            </Tip>
          </Button>
        );
      }
    }

    private yield_adder(deleted_handouts) {
      const deleted_paths = {};
      deleted_handouts.map(obj => {
        if (obj.path) {
          return (deleted_paths[obj.path] = obj.handout_id);
        }
      });

      return path => {
        if (deleted_paths[path] != null) {
          return this.props.actions.handouts.undelete_handout(
            deleted_paths[path]
          );
        } else {
          return this.props.actions.handouts.add_handout(path);
        }
      };
    }

    private render_handout(handout_id: string, index: number): Rendered {
      return (
        <Handout
          frame_id={this.props.frame_id}
          backgroundColor={index % 2 === 0 ? "#eee" : undefined}
          key={handout_id}
          handout={this.get_handout(handout_id)}
          project_id={this.props.project_id}
          students={this.props.students}
          user_map={this.props.user_map}
          actions={this.props.actions}
          is_expanded={this.props.expanded_handouts.has(handout_id)}
          name={this.props.name}
        />
      );
    }

    private render_handouts(handouts): Rendered {
      if (handouts.length == 0) {
        return this.render_no_handouts();
      }
      return (
        <WindowedList
          overscan_row_count={3}
          estimated_row_size={50}
          row_count={handouts.length}
          row_renderer={({ key, index }) => this.render_handout(key, index)}
          row_key={index =>
            handouts[index] != null ? handouts[index].handout_id : undefined
          }
          cache_id={`course-handouts-${this.props.name}-${this.props.frame_id}`}
        />
      );
    }

    private render_no_handouts(): Rendered {
      return (
        <Alert
          bsStyle="info"
          style={{ margin: "auto", fontSize: "12pt", maxWidth: "800px" }}
        >
          <h3>Add a Handout to your Course</h3>
          <p>
            A handout is a <i>directory</i> of files somewhere in your CoCalc
            project, which you send to all of your students. They can then do
            anything they want with that handout.
          </p>

          <p>
            Add a handout to your course by creating a directory using the Files
            tab, then type the name of the directory in the box in the upper
            right and click to search.
          </p>
        </Alert>
      );
    }

    public render(): Rendered {
      // Computed data from state changes have to go in render
      const {
        shown_handouts,
        deleted_handouts,
        num_omitted,
        num_deleted
      } = this.compute_handouts_list();
      const add_handout = this.yield_adder(deleted_handouts);

      const header = (
        <FoldersToolbar
          search={this.state.search}
          search_change={value => this.setState({ search: value })}
          num_omitted={num_omitted}
          project_id={this.props.project_id}
          items={this.props.handouts}
          add_folders={paths => paths.map(add_handout)}
          item_name={"handout"}
          plural_item_name={"handouts"}
        />
      );

      return (
        <div className={"smc-vfill"} style={{ margin: "0 15px" }}>
          {header}
          <div style={{ marginTop: "5px" }} />
          {this.render_handouts(shown_handouts)}
          {num_deleted > 0
            ? this.render_show_deleted_button(
                num_deleted,
                shown_handouts.length != null ? shown_handouts.length : 0
              )
            : undefined}
        </div>
      );
    }
  }
);

export function HandoutsPanelHeader(props: { n: number }) {
  return (
    <Tip
      delayShow={1300}
      title="Handouts"
      tip="This tab lists all of the handouts associated with your course."
    >
      <span>
        <Icon name="files-o" /> Handouts{" "}
        {props.n != null ? ` (${props.n})` : ""}
      </span>
    </Tip>
  );
}

interface HandoutProps {
  frame_id?: string;
  name: string;
  handout: HandoutRecord;
  backgroundColor?: string;
  actions: CourseActions;
  is_expanded: boolean;
  students: StudentsMap;
  user_map: UserMap;
  project_id: string;
}

interface HandoutState {
  confirm_delete: boolean;
  copy_confirm: boolean;
  copy_confirm_handout: boolean;
  copy_handout_confirm_overwrite: boolean;
  copy_handout_confirm_overwrite_text: string;
}

class Handout extends Component<HandoutProps, HandoutState> {
  constructor(props) {
    super(props);
    this.state = {
      confirm_delete: false,
      copy_confirm: false,
      copy_confirm_handout: false,
      copy_handout_confirm_overwrite: false,
      copy_handout_confirm_overwrite_text: ""
    };
  }

  private open_handout_path = e => {
    e.preventDefault();
    const actions = redux.getProjectActions(this.props.project_id);
    if (actions != null) {
      actions.open_directory(this.props.handout.get("path"));
    }
  };

  private render_more_header() {
    return (
      <div>
        <div style={{ fontSize: "15pt", marginBottom: "5px" }}>
          {this.props.handout.get("path")}
        </div>
        <Button onClick={this.open_handout_path}>
          <Icon name="folder-open-o" /> Edit Handout
        </Button>
      </div>
    );
  }

  private render_handout_notes(): Rendered {
    return (
      <Row key="note" style={styles.note}>
        <Col xs={4}>
          <Tip
            title="Notes about this handout"
            tip="Record notes about this handout here. These notes are only visible to you, not to your students.  Put any instructions to students about handouts in a file in the directory that contains the handout."
          >
            Private Handout Notes
            <br />
            <span style={{ color: "#666" }} />
          </Tip>
        </Col>
        <Col xs={20}>
          <MarkdownInput
            persist_id={
              this.props.handout.get("path") +
              this.props.handout.get("handout_id") +
              "note"
            }
            attach_to={this.props.name}
            rows={6}
            placeholder="Private notes about this handout (not visible to students)"
            default_value={this.props.handout.get("note")}
            on_save={value =>
              this.props.actions.handouts.set_handout_note(
                this.props.handout,
                value
              )
            }
          />
        </Col>
      </Row>
    );
  }

  private render_copy_all(status): Rendered[] {
    const steps = STEPS();
    const result: any[] = [];
    for (const step of steps) {
      if (this.state[`copy_confirm_${step}`]) {
        result.push(this.render_copy_confirm(step, status));
      } else {
        result.push(undefined);
      }
    }
    return result;
  }

  private render_copy_confirm(step: string, status): Rendered {
    return (
      <span key={`copy_confirm_${step}`}>
        {status[step] === 0
          ? this.render_copy_confirm_to_all(step, status)
          : undefined}
        {status[step] !== 0
          ? this.render_copy_confirm_to_all_or_new(step, status)
          : undefined}
      </span>
    );
  }

  private render_copy_cancel(step: string): Rendered {
    const cancel = (): void => {
      this.setState({
        [`copy_confirm_${step}`]: false,
        [`copy_confirm_all_${step}`]: false,
        copy_confirm: false,
        copy_handout_confirm_overwrite: false
      } as any);
    };
    return (
      <Button key="cancel" onClick={cancel}>
        Cancel
      </Button>
    );
  }

  private render_copy_handout_confirm_overwrite(step: string): Rendered {
    if (!this.state.copy_handout_confirm_overwrite) {
      return;
    }
    const do_it = (): void => {
      this.copy_handout(step, false);
      this.setState({
        copy_handout_confirm_overwrite: false,
        copy_handout_confirm_overwrite_text: ""
      });
    };
    return (
      <div style={{ marginTop: "15px" }}>
        Type in "OVERWRITE" if you are certain to replace the handout files of
        all students.
        <FormGroup>
          <FormControl
            autoFocus
            type="text"
            ref="copy_handout_confirm_overwrite_field"
            onChange={e =>
              this.setState({
                copy_handout_confirm_overwrite_text: (e.target as any).value
              })
            }
            style={{ marginTop: "1ex" }}
          />
        </FormGroup>
        <ButtonToolbar style={{ textAlign: "center", marginTop: "15px" }}>
          <Button
            disabled={
              this.state.copy_handout_confirm_overwrite_text !== "OVERWRITE"
            }
            bsStyle="danger"
            onClick={do_it}
          >
            <Icon name="exclamation-triangle" /> Confirm replacing files
          </Button>
          {this.render_copy_cancel(step)}
        </ButtonToolbar>
      </div>
    );
  }

  private copy_handout(step, new_only, overwrite?): void {
    // handout to all (non-deleted) students
    switch (step) {
      case "handout":
        this.props.actions.handouts.copy_handout_to_all_students(
          this.props.handout.get("handout_id"),
          new_only,
          overwrite
        );
        break;
      default:
        console.log(`BUG -- unknown step: ${step}`);
    }
    this.setState({
      [`copy_confirm_${step}`]: false,
      [`copy_confirm_all_${step}`]: false,
      copy_confirm: false
    } as any);
  }

  private render_copy_confirm_to_all(step, status): Rendered {
    const n = status[`not_${step}`];
    return (
      <Alert
        bsStyle="warning"
        key={`${step}_confirm_to_all`}
        style={{ marginTop: "15px" }}
      >
        <div style={{ marginBottom: "15px" }}>
          {misc.capitalize(step_verb(step))} this handout {step_direction(step)}{" "}
          the {n} student{n > 1 ? "s" : ""}
          {step_ready(step)}?
        </div>
        <ButtonToolbar>
          <Button
            key="yes"
            bsStyle="primary"
            onClick={() => this.copy_handout(step, false)}
          >
            Yes
          </Button>
          {this.render_copy_cancel(step)}
        </ButtonToolbar>
      </Alert>
    );
  }

  private copy_confirm_all_caution(step): string | undefined {
    switch (step) {
      case "handout":
        return `\
This will recopy all of the files to them.
CAUTION: if you update a file that a student has also worked on, their work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.
Select "Replace student files!" in case you do not want to create any backups and also delete all other files in the assignment directory of their projects.\
`;
    }
  }

  private render_copy_confirm_overwrite_all(step): Rendered {
    return (
      <div key="copy_confirm_overwrite_all" style={{ marginTop: "15px" }}>
        <div style={{ marginBottom: "15px" }}>
          {this.copy_confirm_all_caution(step)}
        </div>
        <ButtonToolbar>
          <Button
            key="all"
            bsStyle="warning"
            onClick={() => this.copy_handout(step, false)}
          >
            Yes, do it
          </Button>
          <Button
            key="all-overwrite"
            bsStyle="danger"
            onClick={() =>
              this.setState({ copy_handout_confirm_overwrite: true })
            }
          >
            Replace student files!
          </Button>
          {this.render_copy_cancel(step)}
        </ButtonToolbar>
        {this.render_copy_handout_confirm_overwrite(step)}
      </div>
    );
  }

  private render_copy_confirm_to_all_or_new(step, status): Rendered {
    const n = status[`not_${step}`];
    const m = n + status[step];
    return (
      <Alert
        bsStyle="warning"
        key={`${step}_confirm_to_all_or_new`}
        style={{ marginTop: "15px" }}
      >
        <div style={{ marginBottom: "15px" }}>
          {misc.capitalize(step_verb(step))} this handout {step_direction(step)}
          ...
        </div>
        <ButtonToolbar>
          <Button
            key="all"
            bsStyle="danger"
            onClick={() =>
              this.setState({
                [`copy_confirm_all_${step}`]: true,
                copy_confirm: true
              } as any)
            }
            disabled={this.state[`copy_confirm_all_${step}`]}
          >
            {step === "handout" ? "All" : "The"} {m} students{step_ready(step)}
            ...
          </Button>
          {n ? (
            <Button
              key="new"
              bsStyle="primary"
              onClick={() => this.copy_handout(step, true)}
            >
              The {n} student{n > 1 ? "s" : ""} not already{" "}
              {past_tense(step_verb(step))} {step_direction(step)}
            </Button>
          ) : (
            undefined
          )}
          {this.render_copy_cancel(step)}
        </ButtonToolbar>
        {this.state[`copy_confirm_all_${step}`]
          ? this.render_copy_confirm_overwrite_all(step)
          : undefined}
      </Alert>
    );
  }

  private render_handout_button(status): Rendered {
    let bsStyle;
    const handout_count = status.handout;
    const { not_handout } = status;
    if (handout_count === 0) {
      bsStyle = "primary";
    } else {
      if (not_handout === 0) {
        bsStyle = "success";
      } else {
        bsStyle = "warning";
      }
    }
    return (
      <Button
        key="handout"
        bsStyle={bsStyle}
        onClick={() =>
          this.setState({ copy_confirm_handout: true, copy_confirm: true })
        }
        disabled={this.state.copy_confirm}
        style={this.outside_button_style}
      >
        <Tip
          title={
            <span>
              Handout: <Icon name="user-secret" /> You{" "}
              <Icon name="long-arrow-right" /> <Icon name="users" /> Students{" "}
            </span>
          }
          tip="Copy the files for this handout from this project to all other student projects."
        >
          <Icon name="share-square-o" /> Distribute...
        </Tip>
      </Button>
    );
  }

  private delete_handout = (): void => {
    this.props.actions.handouts.delete_handout(
      this.props.handout.get("handout_id")
    );
    this.setState({ confirm_delete: false });
  };

  private undelete_handout = (): void => {
    this.props.actions.handouts.undelete_handout(
      this.props.handout.get("handout_id")
    );
  };

  private render_confirm_delete(): Rendered {
    return (
      <Alert bsStyle="warning" key="confirm_delete">
        Are you sure you want to delete this handout (you can undelete it
        later)?
        <br /> <br />
        <ButtonToolbar>
          <Button key="yes" onClick={this.delete_handout} bsStyle="danger">
            <Icon name="trash" /> Delete
          </Button>
          <Button
            key="no"
            onClick={() => this.setState({ confirm_delete: false })}
          >
            Cancel
          </Button>
        </ButtonToolbar>
      </Alert>
    );
  }

  private render_delete_button(): Rendered {
    if (this.props.handout.get("deleted")) {
      return (
        <Tip
          key="delete"
          placement="left"
          title="Undelete handout"
          tip="Make the handout visible again in the handout list and in student grade lists."
        >
          <Button
            onClick={this.undelete_handout}
            style={this.outside_button_style}
          >
            <Icon name="trash-o" /> Undelete
          </Button>
        </Tip>
      );
    } else {
      return (
        <Tip
          key="delete"
          placement="left"
          title="Delete handout"
          tip="Deleting this handout removes it from the handout list and student grade lists, but does not delete any files off of disk.  You can always undelete an handout later by showing it using the 'show deleted handouts' button."
        >
          <Button
            onClick={() => this.setState({ confirm_delete: true })}
            disabled={this.state.confirm_delete}
            style={this.outside_button_style}
          >
            <Icon name="trash" /> Delete...
          </Button>
        </Tip>
      );
    }
  }

  private render_more(): Rendered {
    if (!this.props.is_expanded) return;
    return (
      <Row key="more">
        <Col sm={24}>
          <Card title={this.render_more_header()}>
            <StudentListForHandout
              frame_id={this.props.frame_id}
              handout={this.props.handout}
              students={this.props.students}
              user_map={this.props.user_map}
              actions={this.props.actions}
              name={this.props.name}
            />
            {this.render_handout_notes()}
          </Card>
        </Col>
      </Row>
    );
  }

  private outside_button_style: {
    margin: "4px";
    paddingTop: "6px";
    paddingBottom: "4px";
  };

  private render_handout_name(): Rendered {
    return (
      <h5>
        <a
          href=""
          onClick={e => {
            e.preventDefault();
            return this.props.actions.toggle_item_expansion(
              "handout",
              this.props.handout.get("handout_id")
            );
          }}
        >
          <Icon
            style={{ marginRight: "10px", float: "left" }}
            name={this.props.is_expanded ? "caret-down" : "caret-right"}
          />
          <div>
            {misc.trunc_middle(this.props.handout.get("path"), 24)}
            {this.props.handout.get("deleted") ? <b> (deleted)</b> : undefined}
          </div>
        </a>
      </h5>
    );
  }

  private get_store(): CourseStore {
    const store = redux.getStore(this.props.name);
    if (store == null) throw Error("store must be defined");
    return (store as unknown) as CourseStore;
  }

  private render_handout_heading(): Rendered {
    let status = this.get_store().get_handout_status(
      this.props.handout.get("handout_id")
    );
    if (status == null) {
      status = {
        handout: 0,
        not_handout: 0
      };
    }
    return (
      <Row
        key="summary"
        style={{ backgroundColor: this.props.backgroundColor }}
      >
        <Col md={4} style={{ paddingRight: "0px" }}>
          {this.render_handout_name()}
        </Col>
        <Col md={12}>
          <Row style={{ marginLeft: "8px" }}>
            {this.render_handout_button(status)}
            <span style={{ color: "#666", marginLeft: "5px" }}>
              ({status.handout}/{status.handout + status.not_handout}{" "}
              transferred)
            </span>
          </Row>
          <Row style={{ marginLeft: "8px" }}>
            {this.render_copy_all(status)}
          </Row>
        </Col>
        <Col md={8}>
          <Row>
            <span className="pull-right">{this.render_delete_button()}</span>
          </Row>
          <Row>
            {this.state.confirm_delete
              ? this.render_confirm_delete()
              : undefined}
          </Row>
        </Col>
      </Row>
    );
  }

  public render(): Rendered {
    return (
      <div>
        <Row
          style={
            this.props.is_expanded ? styles.selected_entry : styles.entry_style
          }
        >
          <Col xs={24} style={{ paddingTop: "5px", paddingBottom: "5px" }}>
            {this.render_handout_heading()}
            {this.render_more()}
          </Col>
        </Row>
      </div>
    );
  }
}

interface StudentListForHandoutProps {
  frame_id?: string;
  name: string;
  user_map: UserMap;
  students: StudentsMap;
  handout: HandoutRecord;
  actions: CourseActions;
}

class StudentListForHandout extends Component<StudentListForHandoutProps> {
  private student_list: string[] | undefined = undefined;

  public shouldComponentUpdate(props): boolean {
    const x: boolean = misc.is_different(this.props, props, [
      "handout",
      "students",
      "user_map"
    ]);
    if (x) {
      delete this.student_list;
    }
    return x;
  }

  private get_store(): CourseStore {
    const store = redux.getStore(this.props.name);
    if (store == null) throw Error("store must be defined");
    return (store as unknown) as CourseStore;
  }

  private render_students(): Rendered {
    const info = this.get_student_list();
    return (
      <WindowedList
        overscan_row_count={3}
        estimated_row_size={65}
        row_count={info.length}
        row_renderer={({ key }) => this.render_student_info(key)}
        row_key={index => this.get_student_list()[index]}
        cache_id={`course-handout-${this.props.handout.get("handout_id")}-${
          this.props.actions.name
        }-${this.props.frame_id}`}
      />
    );
  }

  private get_student_list(): string[] {
    if (this.student_list != null) {
      return this.student_list;
    }

    const v0: any[] = util.immutable_to_list(this.props.students, "student_id");

    // Remove deleted students
    const v1: any[] = [];
    for (const x of v0) {
      if (!x.deleted) v1.push(x);
      const user = this.props.user_map.get(x.account_id);
      if (user != null) {
        const first_name = user.get("first_name", "");
        const last_name = user.get("last_name", "");
        x.sort = (last_name + " " + first_name).toLowerCase();
      } else if (x.email_address != null) {
        x.sort = x.email_address.toLowerCase();
      }
    }

    v1.sort((a, b) => misc.cmp(a.sort, b.sort));

    this.student_list = [];
    for (const x of v1) {
      this.student_list.push(x.student_id);
    }

    return this.student_list;
  }

  private render_student_info(student_id: string): Rendered {
    const info = this.get_store().student_handout_info(
      student_id,
      this.props.handout.get("handout_id")
    );
    return (
      <StudentHandoutInfo
        key={student_id}
        actions={this.props.actions}
        info={info}
        title={misc.trunc_middle(
          this.get_store().get_student_name(student_id),
          40
        )}
      />
    );
  }

  public render(): Rendered {
    return (
      <div style={{ height: "70vh", display: "flex", flexDirection: "column" }}>
        <StudentHandoutInfoHeader key="header" title="Student" />
        {this.render_students()}
      </div>
    );
  }
}

interface StudentHandoutInfoHeaderProps {
  title: string;
}

class StudentHandoutInfoHeader extends Component<
  StudentHandoutInfoHeaderProps
> {
  render_col(step_number, key, width) {
    let tip, title;
    switch (key) {
      case "last_handout":
        title = "Distribute to Student";
        tip =
          "This column gives the status whether a handout was received by a student and lets you copy the handout to one student at a time.";
        break;
    }
    return (
      <Col md={width} key={key}>
        <Tip title={title} tip={tip}>
          <b>
            {step_number}. {title}
          </b>
        </Tip>
      </Col>
    );
  }

  render_headers() {
    return <Row>{this.render_col(1, "last_handout", 24)}</Row>;
  }

  render() {
    return (
      <div>
        <Row style={{ borderBottom: "2px solid #aaa" }}>
          <Col md={4} key="title">
            <Tip
              title={this.props.title}
              tip={
                this.props.title === "Handout"
                  ? "This column gives the directory name of the handout."
                  : "This column gives the name of the student."
              }
            >
              <b>{this.props.title}</b>
            </Tip>
          </Col>
          <Col md={20} key="rest">
            {this.render_headers()}
          </Col>
        </Row>
      </div>
    );
  }
}

interface StudentHandoutInfoProps {
  actions: CourseActions;
  info: { handout_id: string; student_id: string; status?: LastCopyInfo };
  title: string;
}

class StudentHandoutInfo extends Component<StudentHandoutInfoProps> {
  constructor(props) {
    super(props);
    this.state = {};
  }

  private open(handout_id: string, student_id: string): void {
    this.props.actions.handouts.open_handout(handout_id, student_id);
  }

  private copy(handout_id: string, student_id: string): void {
    this.props.actions.handouts.copy_handout_to_student(
      handout_id,
      student_id,
      false
    );
  }

  private stop(handout_id: string, student_id: string): void {
    this.props.actions.handouts.stop_copying_handout(handout_id, student_id);
  }

  render_last_time(time) {
    return (
      <div key="time" style={{ color: "#666" }}>
        (<BigTime date={time} />)
      </div>
    );
  }

  render_open_recopy_confirm(name, copy, copy_tip) {
    const key = `recopy_${name}`;
    if (this.state[key]) {
      const v: any[] = [];
      v.push(
        <Button
          key="copy_confirm"
          bsStyle="danger"
          onClick={() => {
            this.setState({ [key]: false });
            return copy();
          }}
        >
          <Icon name="share-square-o" /> Yes, {name.toLowerCase()} again
        </Button>
      );
      v.push(
        <Button
          key="copy_cancel"
          onClick={() => this.setState({ [key]: false })}
        >
          Cancel
        </Button>
      );
      return v;
    } else {
      return (
        <Button
          key="copy"
          bsStyle="warning"
          onClick={() => this.setState({ [key]: true })}
        >
          <Tip title={name} tip={<span>{copy_tip}</span>}>
            <Icon name="share-square-o" /> {name}...
          </Tip>
        </Button>
      );
    }
  }

  render_open_recopy(name, open, copy, copy_tip, open_tip) {
    return (
      <ButtonToolbar key="open_recopy">
        {this.render_open_recopy_confirm(name, copy, copy_tip)}
        <Button key="open" onClick={open}>
          <Tip title="Open handout" tip={open_tip}>
            <Icon name="folder-open-o" /> Open
          </Tip>
        </Button>
      </ButtonToolbar>
    );
  }

  render_open_copying(open, stop) {
    return (
      <ButtonGroup key="open_copying">
        <Button key="copy" bsStyle="success" disabled={true}>
          <Icon name="cc-icon-cocalc-ring" spin /> Working...
        </Button>
        <Button key="stop" bsStyle="danger" onClick={stop}>
          <Icon name="times" />
        </Button>
        <Button key="open" onClick={open}>
          <Icon name="folder-open-o" /> Open
        </Button>
      </ButtonGroup>
    );
  }

  render_copy(name, copy, copy_tip) {
    return (
      <Tip key="copy" title={name} tip={copy_tip}>
        <Button onClick={copy} bsStyle={"primary"}>
          <Icon name="share-square-o" /> {name}
        </Button>
      </Tip>
    );
  }

  render_error(name, error) {
    if (typeof error !== "string") {
      error = misc.to_json(error);
    }
    if (error.indexOf("No such file or directory") !== -1) {
      error = `Somebody may have moved the folder that should have contained the handout.\n${error}`;
    } else {
      error = `Try to ${name.toLowerCase()} again:\n` + error;
    }
    return (
      <ErrorDisplay
        key="error"
        error={error}
        style={{ maxHeight: "140px", overflow: "auto" }}
      />
    );
  }

  render_last(name, obj, info, enable_copy, copy_tip, open_tip) {
    const open = () => this.open(info.handout_id, info.student_id);
    const copy = () => this.copy(info.handout_id, info.student_id);
    const stop = () => this.stop(info.handout_id, info.student_id);
    if (obj == null) {
      obj = {};
    }
    const v: any[] = [];
    if (enable_copy) {
      if (obj.start) {
        v.push(this.render_open_copying(open, stop));
      } else if (obj.time) {
        v.push(this.render_open_recopy(name, open, copy, copy_tip, open_tip));
      } else {
        v.push(this.render_copy(name, copy, copy_tip));
      }
    }
    if (obj.time) {
      v.push(this.render_last_time(obj.time));
    }
    if (obj.error) {
      v.push(this.render_error(name, obj.error));
    }
    return v;
  }

  render() {
    return (
      <div>
        <Row
          style={{
            borderTop: "1px solid #aaa",
            paddingTop: "5px",
            paddingBottom: "5px"
          }}
        >
          <Col md={4} key="title">
            {this.props.title}
          </Col>
          <Col md={20} key="rest">
            <Row>
              <Col md={24} key="last_handout">
                {this.render_last(
                  "Distribute",
                  this.props.info.status,
                  this.props.info,
                  true,
                  "Copy the handout from your project to this student's project.",
                  "Open the student's copy of this handout directly in their project.  You will be able to see them type, chat with them, answer questions, etc."
                )}
              </Col>
            </Row>
          </Col>
        </Row>
      </div>
    );
  }
}
