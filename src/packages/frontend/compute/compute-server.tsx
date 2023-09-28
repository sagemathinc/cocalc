import { Button, Card, Modal, Popconfirm, Table } from "antd";
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
import { deleteServer, undeleteServer } from "./api";

interface Props extends Omit<ComputeServerUserInfo, "id"> {
  id?: number;
  style?: CSSProperties;
  editable: boolean;
  setShowDeleted?: (showDeleted: boolean) => void;
  setSearch?: (search: string) => void;
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
  state_changed,
  cloud,
  configuration,
  data,
  deleted,
  project_id,
  account_id,
  style,
  editable,
  setShowDeleted,
  setSearch,
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
    },
  ];

  const dataSource = [
    {
      label: "Title & Color",
      value: (
        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "space-between",
          }}
        >
          <Title
            title={title}
            id={id}
            editable={editable}
            setError={setError}
            onChange={onTitleChange}
          />
          <Color
            color={color}
            id={id}
            editable={editable}
            setError={setError}
            onChange={onColorChange}
          />
          <Cloud
            cloud={cloud}
            state={state}
            editable={editable}
            setError={setError}
            setCloud={onCloudChange}
            id={id}
            style={{ marginTop: "-10px" }}
          />
        </div>
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
    actions = getActions({ id, state, editable, setError, configuration });
    if (editable) {
      actions.push(
        <Button
          key="edit"
          type="text"
          onClick={() => {
            if (!edit) {
              // clear the search -- otherwise changing the title a little
              // closes the modal!
              setSearch?.("");
            }
            setEdit(!edit);
          }}
        >
          <Icon name="gears" /> {!edit ? "Edit" : "Editing..."}
        </Button>,
      );
    }
    if (deleted && editable && id) {
      actions.push(
        <Button
          key="undelete"
          type="text"
          onClick={async () => {
            await undeleteServer(id);
            setShowDeleted?.(false);
          }}
        >
          <Icon name="trash" /> Undelete
        </Button>,
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
      dataSource={dataSource}
      pagination={false}
    />
  );

  return (
    <Card
      style={{
        width: "100%",
        border: `0.5px solid ${color ?? "#f0f0f0"}`,
        borderRight: `5px solid ${color ?? "#aaa"}`,
        borderLeft: `5px solid ${color ?? "#aaa"}`,
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
            <div
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "space-between",
              }}
            >
              <div style={{ color: "#666" }}>
                <State
                  style={{ marginRight: "5px" }}
                  state={state}
                  state_changed={state_changed}
                  editable={editable}
                  id={id}
                  setError={setError}
                  account_id={account_id}
                  configuration={configuration}
                />
              </div>
              {/*<div
                style={{
                  margin: "5px 15px",
                  flex: 1,
                  height: "15px",
                  background: color,
                }}
              />*/}
              <Title title={title} editable={false} />
            </div>
          )
        }
        description={
          <div style={{ color: "#666" }}>
            <Description
              account_id={account_id}
              cloud={cloud}
              configuration={configuration}
              data={data}
              state={state}
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
          maskStyle={{ background: color, opacity: 0.5 }}
          width={"900px"}
          onCancel={() => setEdit(false)}
          open={edit}
          title={
            <>
              <Icon name="gears" /> Edit Compute Server With Id={id}
            </>
          }
          footer={[
            <div style={{ width: "100%", display: "flex" }}>
              {editable &&
                (deleted ? (
                  <Button
                    key="undelete"
                    onClick={async () => {
                      setShowDeleted?.(false);
                      await undeleteServer(id);
                    }}
                  >
                    <Icon name="trash" /> Undelete
                  </Button>
                ) : (
                  <Popconfirm
                    key="delete"
                    title={"Delete this compute server?"}
                    description={
                      <div style={{ width: "400px" }}>
                        Are you sure you want to delete this compute server?
                        {state != "deprovisioned" && (
                          <b>
                            WARNING: Any data on the boot disk will be deleted.
                          </b>
                        )}
                      </div>
                    }
                    onConfirm={async () => {
                      setEdit(false);
                      await deleteServer(id);
                    }}
                    okText="Yes"
                    cancelText="Cancel"
                  >
                    <Button key="trash" danger>
                      <Icon name="trash" /> Delete...
                    </Button>
                  </Popconfirm>
                ))}
              <div style={{ flex: 1, textAlign: "center" }}>
                {getActions({ id, state, editable, setError, configuration })}
              </div>
              <Button key="close" onClick={() => setEdit(false)}>
                Close
              </Button>
            </div>,
          ]}
        >
          <div style={{ fontSize: "12pt", color: "#666", display: "flex" }}>
            <Description
              account_id={account_id}
              cloud={cloud}
              data={data}
              configuration={configuration}
              state={state}
            />
            <div style={{ flex: 1 }} />
            <State
              style={{ marginRight: "5px" }}
              state={state}
              state_changed={state_changed}
              editable={editable}
              id={id}
              setError={setError}
              account_id={account_id}
              configuration={configuration}
            />
          </div>
          {table}
        </Modal>
      )}
    </Card>
  );
}
