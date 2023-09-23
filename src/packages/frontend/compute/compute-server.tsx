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
import Title from "./title";
import Configuration from "./configuration";

interface Props extends ComputeServerUserInfo {
  style?: CSSProperties;
  editable: boolean;
  projectLink?: boolean;
}

export default function ComputeServer({
  id,
  name,
  color,
  state,
  cloud,
  configuration,
  project_id,
  account_id,
  style,
  editable,
  projectLink,
}: Props) {
  const [error, setError] = useState<string>("");
  const [edit, setEdit] = useState<boolean>(false);

  const columns = [
    { dataIndex: "label", key: "label", width: 100 },
    {
      dataIndex: "value",
      key: "value",
      title: (
        <>
          <span style={{ fontWeight: 250 }}>Click any value to edit</span>
        </>
      ),
    },
  ];

  const data = [
    {
      label: "Title",
      value: (
        <Title title={name} id={id} editable={editable} setError={setError} />
      ),
    },
    {
      label: "Color",
      value: (
        <Color color={color} id={id} editable={editable} setError={setError} />
      ),
    },
    {
      label: "Cloud",
      value: (
        <Cloud cloud={cloud} editable={editable} setError={setError} id={id} />
      ),
    },
    {
      label: "Config",
      value: (
        <Configuration
          editable={editable}
          state={state}
          id={id}
          configuration={configuration}
        />
      ),
    },
  ];
  if (projectLink) {
    data.push({
      label: "Project",
      value: <ProjectTitle project_id={project_id} />,
    });
  }

  const actions: JSX.Element[] = getActions({ state, editable });
  if (editable) {
    actions.push(
      <div onClick={() => setEdit(!edit)}>
        <Icon name="gears" /> {!edit ? "Edit" : "Close"}
      </div>,
    );
  }

  actions.push(
    <div>
      <Icon name="clone" /> Clone
    </div>,
  );

  return (
    <Card
      style={{
        width: "100%",
        border: `1px solid #f0f0f0`,
        borderTop: `7.5px solid ${color ?? "#aaa"}`,
        ...style,
      }}
      actions={actions}
    >
      <Card.Meta
        avatar={
          <div>
            <Icon
              name="server"
              style={{ fontSize: "30px", color: color ?? "#666" }}
            />
            <div style={{ color: "#888" }}>Id: {id}</div>
          </div>
        }
        title={
          <div style={{ width: "100%" }}>
            <State
              style={{ marginRight: "5px" }}
              state={state}
              editable={editable}
              id={id}
              account_id={account_id}
            />
            <div style={{ float: "right", color:"#666" }}>
              <Title title={name} editable={false} />
            </div>
          </div>
        }
        description={
          <Description
            account_id={account_id}
            cloud={cloud}
            configuration={configuration}
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
