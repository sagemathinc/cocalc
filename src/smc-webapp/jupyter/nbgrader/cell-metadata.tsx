import { Map } from "immutable";

import { Component, React, Rendered } from "../../app-framework";

import { plural } from "smc-util/misc2";

import { CELLTYPE_INFO_MAP, state_to_value } from "./cell-types";

import { Tip } from "../../r_misc/tip";

interface Props {
  nbgrader: Map<string, any>;
  start?: number;
  state?: string;
  output?: Map<string, any>;
}

export class NBGraderMetadata extends Component<Props> {
  /*private is_correct(): boolean {
    // use heuristics to try to determine if they have successfully
    // validated their answer based on start, state, output, etc., info.
    // TODO: maybe we need to track last time the input was modified
    // or set a flag when input changes after last eval.  That's very
    // useful anyways (like in sagews)!
    return false;
  }*/

  private render_points(): Rendered {
    const points = this.props.nbgrader.get("points");
    if (points == null) return;
    return (
      <span style={{ marginLeft: "5px" }}>
        ({points} {plural(points, "point")})
      </span>
    );
  }

  public render(): Rendered {
    const nbgrader = this.props.nbgrader.toJS();
    const value: string = state_to_value(nbgrader);
    const info = CELLTYPE_INFO_MAP[value];
    return (
      <Tip
        title={info.student_title}
        tip={info.student_tip}
        placement={"right"}
        size={"small"}
        style={{ cursor: "pointer" }}
      >
        <span>{info.student_title}</span>
        {this.render_points()}
      </Tip>
    );
  }
}
