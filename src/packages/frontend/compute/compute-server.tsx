import { Button, Card, Divider, Modal, Popconfirm, Spin } from "antd";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import { COLORS } from "@cocalc/util/theme";
import getActions from "./action";
import { deleteServer, undeleteServer } from "./api";
import Cloud from "./cloud";
import Color, { randomColor } from "./color";
import ComputeServerLog from "./compute-server-log";
import { Docs } from "./compute-servers";
import Configuration from "./configuration";
import CurrentCost from "./current-cost";
import Description from "./description";
import DetailedState from "./detailed-state";
import Launcher from "./launcher";
import Menu from "./menu";
import { DisplayImage } from "./select-image";
import SerialPortOutput from "./serial-port-output";
import State from "./state";
import Title from "./title";
import { IdleTimeoutMessage } from "./idle-timeout";
import { ShutdownTimeMessage } from "./shutdown-time";
import { RunningProgress } from "@cocalc/frontend/compute/doc-status";
import { SpendLimitStatus } from "./spend-limit";

interface Server1 extends Omit<ComputeServerUserInfo, "id"> {
  id?: number;
}

interface Controls {
  setShowDeleted?: (showDeleted: boolean) => void;
  onTitleChange?;
  onColorChange?;
  onCloudChange?;
  onConfigurationChange?;
}

interface Props {
  server: Server1;
  editable?: boolean;
  style?: CSSProperties;
  controls?: Controls;
  modalOnly?: boolean;
  close?: () => void;
}
export const currentlyEditing = {
  id: 0,
};

export default function ComputeServer({
  server,
  style,
  editable,
  controls,
  modalOnly,
  close,
}: Props) {
  const {
    id,
    project_specific_id,
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
  } = server;

  const {
    setShowDeleted,
    onTitleChange,
    onColorChange,
    onCloudChange,
    onConfigurationChange,
  } = controls ?? {};

  const [error, setError] = useState<string>("");
  const [edit, setEdit0] = useState<boolean>(id == null || !!modalOnly);
  const setEdit = (edit) => {
    setEdit0(edit);
    if (!edit && close != null) {
      close();
    }
    if (edit) {
      currentlyEditing.id = id ?? 0;
    } else {
      currentlyEditing.id = 0;
    }
  };

  if (id == null && modalOnly) {
    return <Spin />;
  }

  let actions: React.JSX.Element[] | undefined = undefined;
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
    if (editable || configuration?.allowCollaboratorControl) {
      actions.push(
        <Button
          key="edit"
          type="text"
          onClick={() => {
            setEdit(!edit);
          }}
        >
          {editable ? (
            <>
              <Icon name="settings" /> Settings
            </>
          ) : (
            <>
              <Icon name="eye" /> Settings
            </>
          )}
        </Button>,
      );
    }
    if (deleted && editable && id) {
      actions.push(
        <Button
          key="undelete"
          type="text"
          onClick={async () => {
            try {
              await undeleteServer(id);
            } catch (err) {
              setError(`${err}`);
              return;
            }
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
        project_id={project_id}
        configuration={configuration}
        data={data}
        onChange={onConfigurationChange}
        setCloud={onCloudChange}
        template={server.template}
      />
    </div>
  );

  const buttons = (
    <div>
      <div style={{ width: "100%", display: "flex" }}>
        <Button onClick={() => setEdit(false)} style={{ marginRight: "5px" }}>
          <Icon name="save" /> {editable ? "Save" : "Close"}
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
                try {
                  await undeleteServer(id);
                } catch (err) {
                  setError(`${err}`);
                  return;
                }
                setShowDeleted?.(false);
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
              cancelText={<CancelText />}
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

  const body =
    id == null ? (
      table
    ) : (
      <Modal
        open={edit}
        destroyOnHidden
        width={"900px"}
        onCancel={() => setEdit(false)}
        title={
          <>
            {buttons}
            <Divider />
            <Icon name="edit" style={{ marginRight: "15px" }} />{" "}
            {editable ? "Edit" : ""} Compute Server With Id=
            {project_specific_id}
          </>
        }
        footer={
          <>
            <div style={{ display: "flex" }}>
              {buttons}
              <Docs key="docs" style={{ flex: 1, marginTop: "5px" }} />
            </div>
          </>
        }
      >
        <div
          style={{ fontSize: "12pt", color: COLORS.GRAY_M, display: "flex" }}
        >
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
    );

  if (modalOnly) {
    return body;
  }

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
          <div style={{ width: "64px", marginBottom: "-20px" }}>
            <Icon
              name={cloud == "onprem" ? "global" : "server"}
              style={{ fontSize: "30px", color: color ?? "#666" }}
            />
            {id != null && (
              <div style={{ color: "#888" }}>Id: {project_specific_id}</div>
            )}
            <div style={{ display: "flex", marginLeft: "-20px" }}>
              {id != null && <ComputeServerLog id={id} />}
              {id != null &&
                configuration?.cloud == "google-cloud" &&
                (state == "starting" ||
                  state == "stopping" ||
                  state == "running") && (
                  <SerialPortOutput
                    id={id}
                    title={title}
                    style={{ marginLeft: "-5px" }}
                  />
                )}
            </div>
            {cloud != "onprem" && state == "running" && id && (
              <>
                {!!server.configuration?.idleTimeoutMinutes && (
                  <div
                    style={{
                      display: "flex",
                      marginLeft: "-10px",
                      color: "#666",
                    }}
                  >
                    <IdleTimeoutMessage
                      id={id}
                      project_id={project_id}
                      minimal
                    />
                  </div>
                )}
                {!!server.configuration?.shutdownTime?.enabled && (
                  <div
                    style={{
                      display: "flex",
                      marginLeft: "-15px",
                      color: "#666",
                    }}
                  >
                    <ShutdownTimeMessage
                      id={id}
                      project_id={project_id}
                      minimal
                    />
                  </div>
                )}
              </>
            )}
            {id != null && (
              <div style={{ marginLeft: "-15px" }}>
                <CurrentCost state={state} cost_per_hour={cost_per_hour} />
              </div>
            )}
            {state == "running" && !!data?.externalIp && (
              <Launcher
                style={{ marginLeft: "-24px" }}
                configuration={configuration}
                data={data}
                compute_server_id={id}
                project_id={project_id}
              />
            )}
            {server?.id != null && <SpendLimitStatus server={server} />}
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
                  display: "flex",
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
                {state == "running" && id && (
                  <div
                    style={{
                      width: "75px",
                      marginTop: "2.5px",
                      marginLeft: "10px",
                    }}
                  >
                    <RunningProgress server={{ ...server, id }} />
                  </div>
                )}
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
              <div
                style={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  textAlign: "right",
                }}
              >
                <Cloud cloud={cloud} state={state} editable={false} id={id} />
              </div>
              <div>
                <Menu
                  style={{ float: "right" }}
                  id={id}
                  project_id={project_id}
                />
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
            <ShowError
              error={error}
              setError={setError}
              style={{ margin: "15px 0", width: "100%" }}
            />
          </div>
        }
      />
      {body}
    </Card>
  );
}

export function useServer({ id, project_id }) {
  useEffect(() => {
    const actions = redux.getProjectActions(project_id);
    actions.incrementReferenceCount();
    return () => {
      actions.decrementReferenceCount();
    };
  }, [project_id]);
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const server = useMemo(() => {
    return computeServers?.get(`${id}`)?.toJS();
  }, [id, project_id, computeServers]);

  return server;
}

export function EditModal({ project_id, id, close }) {
  const account_id = useTypedRedux("account", "account_id");
  const server = useServer({ id, project_id });
  if (account_id == null || server == null) {
    return null;
  }
  return (
    <ComputeServer
      modalOnly
      editable={account_id == server.account_id}
      server={server}
      close={close}
    />
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
        style={{ margin: "15px 0", width: "100%" }}
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
