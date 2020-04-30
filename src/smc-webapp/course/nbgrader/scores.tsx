/*
Component that shows all the scores for all problems and notebooks in a given assignment.
*/

import { Alert, Card } from "antd";
import { Icon } from "../../r_misc";
import { React, Rendered, Component, redux } from "../../app-framework";
import { NotebookScores, Score } from "../../jupyter/nbgrader/autograde";
import { get_nbgrader_score } from "../store";
import { CourseActions } from "../actions";
import { autograded_filename } from "../util";

interface Props {
  nbgrader_scores: { [ipynb: string]: NotebookScores | string };
  assignment_id: string;
  student_id: string;
  name: string;
}

interface State {
  show_all: boolean;
  editing_score_filename?: string;
  editing_score_id?: string;
}

export class NbgraderScores extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { show_all: false };
  }

  private get_actions(): CourseActions {
    return redux.getActions(this.props.name);
  }

  private render_show_all(): Rendered {
    if (!this.state.show_all) return;
    const v: Rendered[] = [];
    for (const filename in this.props.nbgrader_scores) {
      v.push(
        this.render_info_for_file(
          filename,
          this.props.nbgrader_scores[filename]
        )
      );
    }
    return <div>{v}</div>;
  }

  private render_info_for_file(
    filename: string,
    scores: NotebookScores | string
  ): Rendered {
    return (
      <div key={filename} style={{ marginBottom: "5px" }}>
        {this.render_filename_links(filename)}
        {this.render_scores_for_file(filename, scores)}
      </div>
    );
  }

  private open_filename(filename: string): void {
    const actions = this.get_actions();
    actions.assignments.open_file_in_collected_assignment(
      this.props.assignment_id,
      this.props.student_id,
      filename
    );
  }

  private render_filename_links(filename: string): Rendered {
    const filename2 = autograded_filename(filename);
    return (
      <div style={{ fontSize: "12px" }}>
        <a
          style={{ fontFamily: "monospace" }}
          onClick={() => this.open_filename(filename)}
        >
          {filename}
        </a>
        <br />
        <a
          style={{ fontFamily: "monospace" }}
          onClick={() => this.open_filename(filename2)}
        >
          {filename2}
        </a>
      </div>
    );
  }

  private render_scores_for_file(
    filename: string,
    scores: NotebookScores | string
  ): Rendered {
    if (typeof scores == "string") {
      return (
        <Alert
          type="error"
          message={scores + "\n- try running nbgrader again."}
        />
      );
    }
    const v: Rendered[] = [];
    for (const id in scores) {
      v.push(this.render_score(filename, id, scores[id]));
    }
    const style = { padding: "5px" };
    return (
      <table
        style={{
          border: "1px solid lightgray",
          width: "100%",
          borderRadius: "3px",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr key={"header"} style={{ border: "1px solid grey" }}>
            <th style={style}>Problem</th>
            <th style={style}>Score</th>
          </tr>
        </thead>
        <tbody>{v}</tbody>
      </table>
    );
  }

  private set_score(filename: string, id: string, value: string): void {
    const score = parseFloat(value);
    if (isNaN(score) || !isFinite(score)) {
      return; // invalid scores gets thrown away
    }
    this.get_actions().assignments.set_specific_nbgrader_score(
      this.props.assignment_id,
      this.props.student_id,
      filename,
      id,
      score,
      true
    );
  }

  private render_assigned_score(
    filename: string,
    id: string,
    score: Score
  ): Rendered {
    if (!score.manual) {
      return <>{score.score ?? "?"}</>;
    }

    const value = `${score.score != null ? score.score : ""}`;
    const style = {
      width: "48px",
      color: "#666",
      fontSize: "14px",
      border: "1px solid lightgrey",
      display: "inline-block",
      padding: "1px",
    };
    if (
      this.state.editing_score_filename == filename &&
      this.state.editing_score_id == id
    ) {
      return (
        <input
          spellCheck={false}
          autoFocus
          type="input"
          defaultValue={value}
          onBlur={(e) => this.stop_editing_score((e.target as any).value)}
          style={style}
        />
      );
    } else {
      return (
        <span
          style={style}
          onClick={() =>
            this.setState({
              editing_score_filename: filename,
              editing_score_id: id,
            })
          }
        >
          {value ? value : "-"}
        </span>
      );
    }
  }

  private stop_editing_score(value: string): void {
    if (
      this.state.editing_score_id != null &&
      this.state.editing_score_filename != null
    ) {
      this.set_score(
        this.state.editing_score_filename,
        this.state.editing_score_id,
        value
      );
    }
    this.setState({
      editing_score_filename: undefined,
      editing_score_id: undefined,
    });
  }

  private render_score(filename: string, id: string, score: Score): Rendered {
    const backgroundColor = score.score == null ? "#fff1f0" : undefined;
    const style = { padding: "5px", backgroundColor };
    return (
      <tr key={id}>
        <td style={style}>{id}</td>
        <td style={style}>
          {this.render_assigned_score(filename, id, score)} / {score.points}
          {this.render_needs_score(score)}
        </td>
      </tr>
    );
  }

  private render_needs_score(score: Score): Rendered {
    if (!score.manual || score.score != null) return;
    return (
      <div>
        <Icon name="exclamation-triangle" /> Enter score above
      </div>
    );
  }

  private render_more_toggle(action_required: boolean): Rendered {
    return (
      <a
        onClick={() => {
          this.setState({ show_all: !this.state.show_all });
        }}
      >
        {action_required ? (
          <>
            <Icon name="exclamation-triangle" />{" "}
          </>
        ) : undefined}
        {this.state.show_all ? "Less" : "More..."}
      </a>
    );
  }

  private render_title(score, points, error): Rendered {
    return (
      <span>
        <b>nbgrader:</b> {error ? "error" : `${score}/${points}`}
      </span>
    );
  }

  public render(): Rendered {
    const { score, points, error, manual_needed } = get_nbgrader_score(
      this.props.nbgrader_scores
    );
    const action_required: boolean = !!(
      !this.state.show_all &&
      (manual_needed || error)
    );
    const backgroundColor = action_required ? "#fff1f0" : undefined;
    return (
      <Card
        size="small"
        style={{ marginTop: "5px", backgroundColor }}
        extra={this.render_more_toggle(action_required)}
        title={this.render_title(score, points, error)}
        bodyStyle={this.state.show_all ? {} : { padding: 0 }}
      >
        {this.render_show_all()}
      </Card>
    );
  }
}
