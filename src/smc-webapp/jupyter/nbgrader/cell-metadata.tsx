/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { React, Rendered } from "../../app-framework";
import { plural } from "smc-util/misc";
import { CELLTYPE_INFO_MAP, state_to_value } from "./cell-types";
import { Tip } from "../../r_misc/tip";

interface Props {
  nbgrader: Map<string, any>;
  start?: number;
  state?: string;
  output?: Map<string, any>;
}

export const NBGraderMetadata: React.FC<Props> = React.memo((props: Props) => {
  const { nbgrader /*, start, state, output */ } = props;

  /*private is_correct(): boolean {
    // use heuristics to try to determine if they have successfully
    // validated their answer based on start, state, output, etc., info.
    // TODO: maybe we need to track last time the input was modified
    // or set a flag when input changes after last eval.  That's very
    // useful anyways (like in sagews)!
    return false;
  }*/

  function render_points(): Rendered {
    const points = nbgrader.get("points");
    if (points == null) return;
    return (
      <span style={{ marginLeft: "5px" }}>
        ({points} {plural(points, "point")})
      </span>
    );
  }

  function render_id(): Rendered {
    const id = nbgrader.get("grade_id");
    if (id == null) return;
    return <span>, ID: {id}</span>;
  }

  const value: string | undefined = state_to_value(nbgrader.toJS());
  if (value == null) return null;
  const info = CELLTYPE_INFO_MAP[value];
  return (
    <Tip
      title={info.student_title}
      tip={info.student_tip}
      placement={"right"}
      size={"small"}
    >
      <span>{info.student_title}</span>
      {render_points()}
      {render_id()}
    </Tip>
  );
});
