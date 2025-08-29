/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";
import { React, Rendered } from "@cocalc/frontend/app-framework";
import { plural } from "@cocalc/util/misc";
import { CELL_TYPE_INFO_MAP, state_to_value } from "./cell-types";
import { Icon, Tip } from "@cocalc/frontend/components";

interface Props {
  nbgrader: Map<string, any>;
  start?: number;
  state?: string;
  output?: Map<string, any>;
  toolbarIsVisible?: boolean;
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
  const info = CELL_TYPE_INFO_MAP[value];
  if (info.show_only_with_toolbar && !props.toolbarIsVisible) return null;
  return (
    <Tip
      title={info.student_title}
      tip={info.student_tip}
      placement={"right"}
      size={"small"}
    >
      <Icon name="graduation-cap" style={{ marginRight: "5px" }} />
      <span>{info.student_title}</span>
      {render_points()}
      {render_id()}
    </Tip>
  );
});
