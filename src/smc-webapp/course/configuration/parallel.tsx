/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Card } from "antd";
import { React, useRedux, useActions } from "../../app-framework";
import { Icon, NumberInput } from "../../r_misc";
import { plural } from "smc-util/misc";
import { CourseActions } from "../actions";

interface Props {
  name: string;
}
export const Parallel: React.FC<Props> = ({ name }) => {
  const settings = useRedux([name, "settings"]);
  const actions: CourseActions = useActions({ name });

  const parallel =
    settings.get("copy_parallel") ?? actions.get_store().get_copy_parallel();
  function render_parallel() {
    return (
      <div>
        <i>Max number of students</i> to copy and collect files from in
        parallel. What is optimal could depend on compute resources you or your
        students have bought.
        <NumberInput
          on_change={(n) => actions.configuration.set_copy_parallel(n)}
          min={1}
          max={50}
          number={parallel}
        />
      </div>
    );
  }

  return (
    <Card
      title={
        <>
          {" "}
          <Icon name="users" /> Parallel limit: copy {parallel} assignments at a time{" "}
          {plural(parallel, "student")} at a time
        </>
      }
    >
      {render_parallel()}
    </Card>
  );
};
