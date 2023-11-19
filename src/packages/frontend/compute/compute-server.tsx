import { Button, Card, Divider, Modal, Popconfirm } from "antd";
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
import { randomColor } from "./color";
import ComputeServerLog from "./compute-server-log";
import CurrentCost from "./current-cost";
import { webapp_client } from "@cocalc/frontend/webapp-client";

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
  color = randomColor(),
  state,
  state_changed,
  detailed_state,
  cloud,
  cost_per_hour,
  purchase_id,
  configuration,
  data,
  deleted,
  error: backendError,
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

  let actions: JSX.Element[] | undefined = undefined;
  if (id != null) {
    actions = getActions({
      id,
      state,
      editable,
      setError,
      configuration,
      editModal: false,
      type: "text",
      project_id,
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
    <div>
      <Divider>
        <Icon
          name="cloud-dev"
          style={{ fontSize: "16pt", marginRight: "15px" }}
        />{" "}
        Title, Color, and Cloud
      </Divider>
      <div
        style={{
          marginTop: "15px",
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
          style={{ marginTop: "-2.5px", marginLeft: "10px" }}
        />
      </div>
      <div style={{ color: "#888", marginTop: "5px" }}>
        Change the title and color at any time.
      </div>
      <Divider>
        <Icon name="gears" style={{ fontSize: "16pt", marginRight: "15px" }} />{" "}
        Configuration
      </Divider>
      <Configuration
        editable={editable}
        state={state}
        id={id}
        configuration={configuration}
        onChange={onConfigurationChange}
      />

      {projectLink && (
        <div>
          <Divider orientation="left">Project</Divider>
          <ProjectTitle project_id={project_id} />
        </div>
      )}
    </div>
  );

  const buttons = (
    <div>
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
            editModal: edit,
            type: undefined,
            project_id,
          })}
        </div>{" "}
        {editable &&
          id &&
          (deleted || state == "deprovisioned") &&
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
      <BackendError error={backendError} id={id} project_id={project_id} />
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
          <div style={{ width: "64px" }}>
            <Icon
              name={cloud == "onprem" ? "global" : "server"}
              style={{ fontSize: "30px", color: color ?? "#666" }}
            />
            {id != null && <div style={{ color: "#888" }}>Id: {id}</div>}
            {id != null && (
              <ComputeServerLog
                id={id}
                style={{ marginLeft: "-15px" }}
                title={title}
              />
            )}
            {id != null && (
              <div style={{ marginLeft: "-15px" }}>
                <CurrentCost state={state} cost_per_hour={cost_per_hour} />
              </div>
            )}
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
                borderBottom: `1px solid ${color}`,
                padding: "0 10px 5px 0",
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
            <BackendError
              error={backendError}
              id={id}
              project_id={project_id}
            />
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
              <DetailedState
                id={id}
                project_id={project_id}
                detailed_state={detailed_state}
                color={color}
                configuration={configuration}
              />
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
          width={"900px"}
          onCancel={() => setEdit(false)}
          open={edit}
          title={
            <>
              {buttons}
              <Divider />
              <Icon name="edit" /> Edit Compute Server With Id={id}
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

function BackendError({ error, id, project_id }) {
  if (!error || !id) {
    return null;
  }
  return (
    <div style={{ marginTop: "10px", display: "flex", fontWeight: "normal" }}>
      <ShowError
        error={error}
        style={{ fontSize: "10pt" }}
        setError={async () => {
          try {
            await webapp_client.async_query({
              query: {
                compute_servers: {
                  id,
                  project_id,
                  error: "",
                },
              },
            });
          } catch (err) {
            console.warn(err);
          }
        }}
      />
    </div>
  );
}
