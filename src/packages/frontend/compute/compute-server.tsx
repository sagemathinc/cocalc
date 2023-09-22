import { Card, Table } from "antd";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import { CSSProperties, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components";
import Color from "./color";
import State from "./state";
import getActions from "./action";
import Cloud from "./cloud";
import Description from "./description";

interface Props extends ComputeServerUserInfo {
  style?: CSSProperties;
  editable: boolean;
}

export default function ComputeServer({
  id,
  name,
  color,
  state,
  cloud,
  configuration,
  project_id,
  style,
  editable,
}: Props) {
  const [error, setError] = useState<string>("");
  const [edit, setEdit] = useState<boolean>(false);

  const columns = [
    { dataIndex: "label", key: "label", width: 150 },
    { dataIndex: "value", key: "value" },
  ];

  const data = [
    { label: "State", value: state },
    {
      label: "Cloud",
      value: <Cloud cloud={cloud} id={id} editable={editable} />,
    },
    {
      label: "Configuration",
      value: JSON.stringify(configuration, undefined, 2),
    },
    {
      label: "Color",
      value: (
        <Color color={color} id={id} editable={editable} setError={setError} />
      ),
    },
    {
      label: "Project",
      value: <ProjectTitle project_id={project_id} />,
    },
  ];

  const actions: JSX.Element[] = getActions({ state, editable });
  if (editable) {
    actions.push(
      <div onClick={() => setEdit(!edit)}>
        <Icon name="gears" /> {!edit ? "Edit" : "Hide Details"}
      </div>,
    );
  }
  return (
    <Card
      style={{
        width: "100%",
        border: `2px solid ${color ?? "#aaa"}`,
        ...style,
      }}
      actions={actions}
    >
      <Card.Meta
        avatar={
          <Icon
            name="server"
            style={{ fontSize: "30px", color: color ?? "#666" }}
          />
        }
        title={
          <div style={{ width: "100%" }}>
            <div style={{ float: "right" }}>
              <State state={state} editable={editable} id={id} />
            </div>
            {name ?? "Unnamed Compute Server"}
          </div>
        }
        description={
          <Description
            state={state}
            cloud={cloud}
            configuration={configuration}
            id={id}
          />
        }
      />
      <ShowError error={error} setError={setError} />
      {edit && (
        <Table
          style={{ marginTop: "15px" }}
          rowKey="label"
          columns={columns}
          dataSource={data}
          pagination={false}
        />
      )}
    </Card>
  );
}
