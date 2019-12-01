/*
Panel for configuring peer grading
*/

import {
  Component,
  React,
  Rendered
} from "../../app-framework";

import  {server_days_ago} from "smc-util/misc";
import { AssignmentRecord } from "../store";
import { CourseActions } from "../actions";

import {
  Alert,
  Button,
  Checkbox,
  Grid
} from "react-bootstrap";

import {
  DateTimePicker,
  Icon,
  LabeledRow,
  MarkdownInput,
  Tip,
  NumberInput,
} from "../../r_misc";

interface Props {
  assignment: AssignmentRecord;
  actions: CourseActions;
}

export class ConfigurePeerGrading extends Component<Props> {

  render_configure_peer_checkbox(config) {
    return (
      <div>
        <Checkbox
          checked={config.enabled != null ? config.enabled : false}
          key="peer_grade_checkbox"
          ref="peer_grade_checkbox"
          onChange={e =>
            this.set_peer_grade({ enabled: (e.target as any).checked })
          }
          style={{ display: "inline-block", verticalAlign: "middle" }}
        />
        Enable Peer Grading
      </div>
    );
  }

  _peer_due(date): Date | undefined {
    if (date == null) {
      return date;
    }
    if (date != null) {
      return new Date(date);
    } else {
      return server_days_ago(-7);
    }
  }

  set_peer_grade = config => {
    this.props.actions.assignments.set_peer_grade(
      this.props.assignment.get("assignment_id"),
      config
    );
  };

  peer_due_change = date => {
    const due_date = this._peer_due(date);
    let due_date_string: string | undefined;
    if (due_date != undefined) {
      due_date_string = due_date.toISOString();
    }
    this.set_peer_grade({
      due_date: due_date_string
    });
  };


  render_configure_peer_due(config) {
    const label = (
      <Tip
        placement="top"
        title="Set the due date"
        tip="Set the due date for grading this assignment.  Note that you must explicitly click a button to collect graded assignments when -- they are not automatically collected on the due date.  A file is included in the student peer grading assignment telling them when they should finish their grading."
      >
        Due
      </Tip>
    );
    return (
      <LabeledRow label_cols={6} label={label}>
        <DateTimePicker
          placeholder={"Set Peer Grading Due Date"}
          value={this._peer_due(config.due_date)}
          onChange={this.peer_due_change}
        />
      </LabeledRow>
    );
  }

  render_configure_peer_number(config) {
    let left;
    const store = this.props.actions.get_store();
    return (
      <LabeledRow
        label_cols={6}
        label="Number of students who will grade each assignment"
      >
        <NumberInput
          on_change={n => this.set_peer_grade({ number: n })}
          min={1}
          max={
            ((left = store != null ? store.num_students() : undefined) != null
              ? left
              : 2) - 1
          }
          number={config.number != null ? config.number : 1}
        />
      </LabeledRow>
    );
  }

  render_configure_grading_guidelines(config) {
    return (
      <div style={{ marginTop: "10px" }}>
        <LabeledRow
          label_cols={6}
          label="Grading guidelines, which will be made available to students in their grading folder in a file GRADING_GUIDE.md.  Tell your students how to grade each problem.  Since this is a markdown file, you might also provide a link to a publicly shared file or directory with guidelines."
        >
          <div
            style={{
              background: "white",
              padding: "10px",
              border: "1px solid #ccc",
              borderRadius: "3px"
            }}
          >
            <MarkdownInput
              persist_id={
                this.props.assignment.get("path") +
                this.props.assignment.get("assignment_id") +
                "grading-guidelines"
              }
              attach_to={this.props.actions.name}
              rows={16}
              placeholder="Enter your grading guidelines for this assignment..."
              default_value={config.guidelines}
              on_save={x => this.set_peer_grade({ guidelines: x })}
            />
          </div>
        </LabeledRow>
      </div>
    );
  }



  public render() : Rendered {
    const peer_info = this.props.assignment.get("peer_grade");
    let config: { enabled?: boolean } = {};
    if (peer_info) {
      config = peer_info.toJS();
    }
    return (
      <Alert bsStyle="warning">
        <h3>
          <Icon name="users" /> Peer grading
        </h3>

        <div style={{ color: "#666" }}>
          Use peer grading to randomly (and anonymously) redistribute collected
          homework to your students, so that they can grade it for you.
        </div>

        {this.render_configure_peer_checkbox(config)}
        <Grid fluid={true}>
          {config.enabled
            ? this.render_configure_peer_number(config)
            : undefined}
          {config.enabled ? this.render_configure_peer_due(config) : undefined}
          {config.enabled
            ? this.render_configure_grading_guidelines(config)
            : undefined}
        </Grid>
        <Button
          onClick={() =>
            this.props.actions.toggle_item_expansion(
              "peer_config",
              this.props.assignment.get("assignment_id")
            )
          }
        >
          Close
        </Button>
      </Alert>
    );
  }


}
