import { Button, Card, Modal, Table } from "antd";
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

interface Props extends Omit<ComputeServerUserInfo, "id"> {
  id?: number;
  style?: CSSProperties;
  editable: boolean;
  projectLink?: boolean;
  onTitleChange?;
  onColorChange?;
  onCloudChange?;
  onConfigurationChange?;
  setIsValid?: (valid) => void;
}

export default function ComputeServer({
  id,
  title,
  color = "#888",
  state,
  cloud,
  configuration,
  project_id,
  account_id,
  style,
  editable,
  projectLink,
  onTitleChange,
  onColorChange,
  onCloudChange,
  onConfigurationChange,
}: Props) {
  const [error, setError] = useState<string>("");
  const [edit, setEdit] = useState<boolean>(id == null);

  const columns = [
    { dataIndex: "label", key: "label", width: 100 },
    {
      dataIndex: "value",
      key: "value",
      title:
        id != null ? (
          <>
            <span style={{ fontWeight: 250 }}>Click any value to edit</span>
          </>
        ) : undefined,
    },
  ];

  const data = [
    {
      label: "Title",
      value: (
        <Title
          title={title}
          id={id}
          editable={editable}
          setError={setError}
          onChange={onTitleChange}
        />
      ),
    },
    {
      label: "Color",
      value: (
        <Color
          color={color}
          id={id}
          editable={editable}
          setError={setError}
          onChange={onColorChange}
        />
      ),
    },
    {
      label: "Cloud",
      value: (
        <Cloud
          cloud={cloud}
          state={state}
          editable={editable}
          setError={setError}
          setCloud={onCloudChange}
          id={id}
        />
      ),
    },
    {
      label: "Virtual Machine",
      value: (
        <Configuration
          editable={editable}
          state={state}
          id={id}
          configuration={configuration}
          onChange={onConfigurationChange}
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

  let actions: JSX.Element[] | undefined = undefined;
  if (id != null) {
    actions = getActions({ id, state, editable, setError });
    if (editable) {
      actions.push(
        <div onClick={() => setEdit(!edit)}>
          <Icon name="gears" /> {!edit ? "Edit" : "Editing..."}
        </div>,
      );
    }

    // TODO: for later
    //     actions.push(
    //       <div>
    //         <Icon name="clone" /> Clone
    //       </div>,
    //     );
  }

  const table = (
    <Table
      style={{ marginTop: "15px" }}
      rowKey="label"
      columns={columns}
      dataSource={data}
      pagination={false}
    />
  );

  return (
    <Card
      style={{
        width: "100%",
        border: `1px solid ${color ?? "#f0f0f0"}`,
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
            {id != null && <div style={{ color: "#888" }}>Id: {id}</div>}
          </div>
        }
        title={
          id == null ? undefined : (
            <div style={{ width: "100%" }}>
              <State
                style={{ marginRight: "5px" }}
                state={state}
                editable={editable}
                id={id}
                setError={setError}
                account_id={account_id}
              />
              <div style={{ float: "right", color: "#666" }}>
                <Title title={title} editable={false} />
              </div>
            </div>
          )
        }
        description={
          <div style={{ textAlign: "center", color: "#666" }}>
            <Description
              account_id={account_id}
              cloud={cloud}
              configuration={configuration}
              short
            />
          </div>
        }
      />
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px 0" }}
      />
      {id == null ? (
        table
      ) : (
        <Modal
          width={"900px"}
          onCancel={() => setEdit(false)}
          open={edit}
          title={
            <>
              Edit Compute Server: <Title title={title} editable={false} />
              <div style={{ textAlign: "center", color: "#666" }}>
                <Description
                  account_id={account_id}
                  cloud={cloud}
                  configuration={configuration}
                />
              </div>
            </>
          }
          footer={[
            <Button size="large" onClick={() => setEdit(false)}>
              Done
            </Button>,
          ]}
        >
          {table}
        </Modal>
      )}
    </Card>
  );
}
