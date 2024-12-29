import { ACTION_INFO } from "@cocalc/util/db-schema/compute-servers";
import { Button, Space } from "antd";
import { useState } from "react";
import type { CourseActions } from "../actions";
import { useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import { getUnitId } from "./util";
import type { Unit } from "../store";

interface Props {
  actions: CourseActions;
  unit: Unit;
}

export default function Students({ actions, unit }: Props) {
  const students = useRedux(actions.name, "students");
  const v: JSX.Element[] = [];
  for (const [_, student] of students) {
    if (student.get("deleted")) {
      continue;
    }
    v.push(
      <StudentControl
        key={student.get("student_id")}
        student={student}
        actions={actions}
        unit={unit}
      />,
    );
  }
  return <Space direction="vertical">{v}</Space>;
}

const ACTIONS = [
  "create",
  "start",
  "stop",
  "delete",
  "deprovision",
  "transfer",
];

function StudentControl({ student, actions, unit }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const student_id = student.get("student_id");
  const name = actions.get_store().get_student_name(student.get("student_id"));
  const v = [
    <div
      key="name"
      style={{
        width: "150px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {name}
    </div>,
  ];
  for (const action of ACTIONS) {
    let disabled = loading;
    if (!disabled) {
      // disable some buttons depending on state info...
      if (unit.getIn(["compute_server", "students", student_id, "server_id"])) {
        if (action == "create") {
          disabled = true;
        } else {
        }
      } else {
        if (action != "create") {
          disabled = true;
        }
      }
    }
    const icon = ACTION_INFO[action]?.icon;
    v.push(
      <Button
        disabled={disabled}
        onClick={() => {
          try {
            setLoading(true);
            const unit_id = getUnitId(unit);
            actions.compute.createComputeServer({ student_id, unit_id });
          } catch (err) {
            setError(`${err}`);
          } finally {
            setLoading(false);
          }
        }}
        key={action}
      >
        {icon != null ? <Icon name={icon as any} /> : undefined} {capitalize(action)}
      </Button>,
    );
  }
  return (
    <>
      <Space>{v}</Space>{" "}
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
    </>
  );
}
