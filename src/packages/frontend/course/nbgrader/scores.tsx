/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Component that shows all the scores for all problems and notebooks in a given assignment.
*/

import { Alert, Button, Card } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useActions } from "@cocalc/frontend/app-framework";
import { ReactNode, useState } from "react";
import {
  NotebookScores,
  Score,
} from "@cocalc/frontend/jupyter/nbgrader/autograde";
import { get_nbgrader_score } from "../store";
import { CourseActions } from "../actions";
import { autograded_filename } from "../util";

interface Props {
  nbgrader_scores: { [ipynb: string]: NotebookScores | string };
  nbgrader_score_ids?: { [ipynb: string]: string[] };
  assignment_id: string;
  student_id: string;
  name: string;
  show_all?: boolean;
  set_show_all?: () => void;
  run_button?: ReactNode;
  buttonSize?: "small" | "middle" | "large";
}

interface State {
  filename?: string;
  id?: string;
}

export function NbgraderScores({
  nbgrader_scores,
  nbgrader_score_ids,
  assignment_id,
  student_id,
  name,
  show_all,
  set_show_all,
  run_button,
  buttonSize,
}: Props) {
  const actions = useActions<CourseActions>({ name });

  const [editingScore, setEditingScore] = useState<State>({});

  function render_show_all() {
    if (!show_all) return;
    const v: React.JSX.Element[] = [];
    for (const filename in nbgrader_scores) {
      v.push(render_info_for_file(filename, nbgrader_scores[filename]));
    }
    return <div>{v}</div>;
  }

  function render_info_for_file(
    filename: string,
    scores: NotebookScores | string,
  ) {
    return (
      <div key={filename} style={{ marginBottom: "5px" }}>
        {render_filename_links(filename)}
        {render_scores_for_file(filename, scores)}
      </div>
    );
  }

  function open_filename(filename: string): void {
    actions.assignments.open_file_in_collected_assignment(
      assignment_id,
      student_id,
      filename,
    );
  }

  function render_filename_links(filename: string) {
    const filename2 = autograded_filename(filename);
    return (
      <div style={{ fontSize: "12px" }}>
        <a
          style={{ fontFamily: "monospace" }}
          onClick={() => open_filename(filename)}
        >
          {filename}
        </a>
        <br />
        <a
          style={{ fontFamily: "monospace" }}
          onClick={() => open_filename(filename2)}
        >
          {filename2}
        </a>
      </div>
    );
  }

  function render_scores_for_file(
    filename: string,
    scores: NotebookScores | string,
  ) {
    if (typeof scores == "string") {
      return (
        <Alert
          type="error"
          message={scores + "\n- try running nbgrader again."}
        />
      );
    }
    const v: React.JSX.Element[] = [];

    const ids: string[] = nbgrader_score_ids?.[filename] ?? [];
    for (const id in scores) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }

    for (const id of ids) {
      if (scores[id] != null) {
        v.push(render_score(filename, id, scores[id]));
      }
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

  function set_score(filename: string, id: string, value: string): void {
    const score = parseFloat(value);
    if (isNaN(score) || !isFinite(score)) {
      return; // invalid scores gets thrown away
    }
    actions.assignments.set_specific_nbgrader_score(
      assignment_id,
      student_id,
      filename,
      id,
      score,
      true,
    );
  }

  function render_assigned_score(filename: string, id: string, score: Score) {
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
    if (editingScore.filename == filename && editingScore.id == id) {
      return (
        <input
          spellCheck={false}
          autoFocus
          type="input"
          defaultValue={value}
          onBlur={(e) => stop_editing_score((e.target as any).value)}
          style={style}
        />
      );
    } else {
      return (
        <span style={style} onClick={() => setEditingScore({ filename, id })}>
          {value ? value : "-"}
        </span>
      );
    }
  }

  function stop_editing_score(value: string): void {
    if (editingScore.id != null && editingScore.filename != null) {
      set_score(editingScore.filename, editingScore.id, value);
    }
    setEditingScore({
      filename: undefined,
      id: undefined,
    });
  }

  function render_score(filename: string, id: string, score: Score) {
    const backgroundColor = score.score == null ? "#fff1f0" : undefined;
    const style = { padding: "5px", backgroundColor };
    return (
      <tr key={id}>
        <td style={style}>{id}</td>
        <td style={style}>
          {render_assigned_score(filename, id, score)} / {score.points}
          {render_needs_score(score)}
        </td>
      </tr>
    );
  }

  function render_needs_score(score: Score) {
    if (!score.manual || score.score != null) return;
    return (
      <div>
        <Icon name="exclamation-triangle" /> Enter score above
      </div>
    );
  }

  function render_more_toggle({
    hasScores,
    manual_needed,
    error,
    buttonSize,
  }: {
    hasScores: boolean;
    manual_needed: boolean;
    error: boolean;
    buttonSize?: "small" | "middle" | "large";
  }) {
    if (!hasScores) return undefined;
    const showManual = manual_needed || error;
    const editButton = (
      <Button
        size={buttonSize}
        icon={<Icon name="pencil" />}
        aria-label="Edit nbgrader scores"
        onClick={() => set_show_all?.()}
      />
    );
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {showManual ? <span>Manual</span> : null}
        {editButton}
      </span>
    );
  }

  function render_title(content: string) {
    return (
      <span>
        <b>nbgrader:</b> {content}
      </span>
    );
  }

  const { score, points, error = false, manual_needed } =
    get_nbgrader_score(nbgrader_scores);

  const hasScores = Object.keys(nbgrader_scores ?? {}).length > 0;
  const action_required: boolean = !!(
    !show_all &&
    (manual_needed || error || !hasScores)
  );

  const backgroundColor = action_required ? "#fff1f0" : undefined;

  const titleContent = hasScores ? (error ? "error" : `${score}/${points}`) : "--/--";

  const titleWithRun =
    run_button == null ? (
      render_title(titleContent)
    ) : (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {run_button}
        {render_title(titleContent)}
      </div>
    );

  return (
    <Card
      size="small"
      style={{ marginTop: "5px", backgroundColor }}
      extra={render_more_toggle({
        hasScores,
        manual_needed,
        error,
        buttonSize,
      })}
      title={titleWithRun}
      styles={{ body: show_all ? {} : { padding: 0 } }}
    >
      {render_show_all()}
    </Card>
  );
}
