import { Button, Card, Divider, Modal, Popconfirm, Table } from "antd";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import { CSSProperties, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components";
import Color from "./color";
import State from "./state";
import DetailedState from "./detailed-state";
import getActions from "./action";
import Cloud from "./cloud";
import Description from "./description";
import Title from "./title";
import Configuration from "./configuration";
import { deleteServer, undeleteServer } from "./api";
import { DisplayImage } from "./select-image";

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
  detailed_state,
  cloud,
  cost_per_hour,
  purchase_id,
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
            style={{
              marginLeft: "10px",
            }}
          />
          <Cloud
            cloud={cloud}
            state={state}
            editable={editable}
            setError={setError}
            setCloud={onCloudChange}
            id={id}
            style={{ marginTop: "-5px", marginLeft: "10px" }}
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
    dataSource.push({
      label: "Project",
      value: <ProjectTitle project_id={project_id} />,
    });
  }

  let actions: JSX.Element[] | undefined = undefined;
  if (id != null) {
    actions = getActions({
      id,
      state,
      editable,
      setError,
      configuration,
      includeDangerous: true,
      type: "text",
    });
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

  const buttons = (
    <div style={{ width: "100%", display: "flex" }}>
      <Button onClick={() => setEdit(false)} style={{ marginRight: "5px" }}>
        <Icon name="save" /> Save
      </Button>
      <div style={{ marginRight: "5px" }}>
        {getActions({
          id,
          state,
          editable,
          setError,
          configuration,
          includeDangerous: true,
          type: undefined,
        })}
      </div>{" "}
      {editable &&
        id &&
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
                  <b>WARNING: Any data on the boot disk will be deleted.</b>
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
              <Icon name="trash" /> Delete
            </Button>
          </Popconfirm>
        ))}
    </div>
  );

  return (
    <Card
      style={{
        opacity: deleted ? 0.5 : undefined,
        width: "100%",
        minWidth: "500px",
        border: `0.5px solid ${color ?? "#f0f0f0"}`,
        borderRight: `10px solid ${color ?? "#aaa"}`,
        borderLeft: `10px solid ${color ?? "#aaa"}`,
        ...style,
      }}
      actions={actions}
    >
      <Card.Meta
        avatar={
          <div>
            <Icon
              name={cloud == "onprem" ? "global" : "server"}
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
                color: "#666",
                //border: `1px solid ${color}`,
                // borderRadius: "5px",
                borderBottom: `1px solid ${color}`,
                padding: "0 10px",
              }}
            >
              <div
                style={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  flex: 1,
                }}
              >
                <State
                  data={data}
                  state={state}
                  state_changed={state_changed}
                  editable={editable}
                  id={id}
                  account_id={account_id}
                  configuration={configuration}
                  cost_per_hour={cost_per_hour}
                  purchase_id={purchase_id}
                />
              </div>
              <Title
                title={title}
                editable={false}
                style={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  flex: 1,
                }}
              />
              <div
                style={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  flex: 1,
                }}
              >
                <DisplayImage configuration={configuration} />
              </div>
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
            {(state == "running" ||
              state == "stopping" ||
              state == "starting") && (
              <DetailedState detailed_state={detailed_state} color={color} />
            )}
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
          destroyOnClose
          maskStyle={{ background: color, opacity: 0.5 }}
          width={"900px"}
          onCancel={() => setEdit(false)}
          open={edit}
          title={
            <>
              {buttons}
              <Divider />
              <Icon name="gears" /> Edit Compute Server With Id={id}
            </>
          }
          footer={[buttons]}
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
              data={data}
              state_changed={state_changed}
              editable={editable}
              id={id}
              account_id={account_id}
              configuration={configuration}
              cost_per_hour={cost_per_hour}
              purchase_id={purchase_id}
            />
          </div>
          {table}
        </Modal>
      )}
    </Card>
  );
}
