/*
Component that shows all the scores for all problems and notebooks in a given assignment.
*/

import { React, Rendered, Component } from "../../app-framework";
import { NotebookScores } from "../../jupyter/nbgrader/autograde";
import { get_nbgrader_score } from "../store";

interface Props {
  nbgrader_scores: { [ipynb: string]: NotebookScores | string };
}

interface State {
  show_all: boolean;
}

export class NbgraderScores extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { show_all: false };
  }

  private render_show_all(): Rendered {
    if (!this.state.show_all) {
      return <span>...</span>;
    }
    return (
      <pre>Grades : {JSON.stringify(this.props.nbgrader_scores, null, 2)}</pre>
    );
  }

  public render(): Rendered {
    const { score, points, error } = get_nbgrader_score(
      this.props.nbgrader_scores
    );
    return (
      <div
        style={{ cursor: "pointer" }}
        onClick={() => {
          this.setState({ show_all: !this.state.show_all });
        }}
        title={
          this.state.show_all
            ? "Grade details (click to hide)"
            : "Grade summary (click to show details)"
        }
      >
        <b>nbgrader:</b> {error ? "error" : `${score}/${points}`}
        {this.render_show_all()}
      </div>
    );
  }
}
