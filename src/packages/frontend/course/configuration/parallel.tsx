/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, InputNumber } from "antd";
import { useEffect, useState } from "react";
import { useRedux, useActions } from "../../app-framework";
import { Icon } from "../../components";
import { CourseActions } from "../actions";
import { MAX_COPY_PARALLEL } from "../store";

interface Props {
  name: string;
}
export function Parallel({ name }: Props) {
  const settings = useRedux([name, "settings"]);
  const actions: CourseActions = useActions({ name });

  const parallel =
    settings.get("copy_parallel") ?? actions.get_store().get_copy_parallel();
  const [value, setValue] = useState<number | null>(parallel);
  useEffect(() => {
    setValue(parallel);
  }, [parallel]);

  function render_parallel() {
    return (
      <div>
        <i>Max number of students</i> to copy and collect files from in
        parallel. What is optimal depends on available compute resources
        (upgrades) and the size of the content you are copying.
        <br />
        <div style={{ textAlign: "center", marginTop: "15px" }}>
          <InputNumber
            style={{ width: "200px" }}
            onChange={(n) => setValue(n)}
            min={1}
            max={MAX_COPY_PARALLEL}
            value={value}
            onBlur={() => {
              if (!value) {
                setValue(1);
                actions.configuration.set_copy_parallel(1);
                return;
              }
              if (value != parallel) {
                actions.configuration.set_copy_parallel(value);
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <Card
      title={
        <>
          {" "}
          <Icon name="users" /> Parallel Limit: Copy {parallel} assignments at a
          time
        </>
      }
    >
      {render_parallel()}
    </Card>
  );
}
