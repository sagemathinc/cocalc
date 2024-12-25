/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This configures the datastore configuration for student and the shared project.
// basically: if it is "true", the datastore config of the teacher project is looked up when the project starts
// and used to configure it in read-only mode. In the future, a natural extension is to explicitly list the datastores
// that should be inherited, or configure the readonly property. but for now, it's just true or false.

import { useEffect, useState } from "react";
import { ConfigurationActions } from "./actions";
import { Button, Card, Popconfirm, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { computeServersEnabled } from "@cocalc/frontend/compute";
import SelectServer from "@cocalc/frontend/compute/select-server";
import { isEqual } from "lodash";
import type { CourseActions } from "../actions";
import ComputeServerTerminalCommand from "./compute-server-terminal-command";

interface Props {
  project_id: string;
  actions: ConfigurationActions;
  settings;
  close?: Function;
}

export default function ComputeServerConfig({
  actions,
  close,
  settings,
  project_id,
}: Props) {
  const [needSave, setNeedSave] = useState<boolean>(false);
  const [nextVal, setNextVal] = useState<any>(
    settings?.get("compute_server")?.toJS() ?? {},
  );

  useEffect(() => {
    setNeedSave(
      !isEqual(nextVal, settings?.get("compute_server")?.toJS() ?? {}),
    );
  }, [nextVal, settings]);

  useEffect(() => {
    // needed because of realtime collaboration, multiple frames, modal, etc!
    setNextVal(settings?.get("compute_server")?.toJS() ?? {});
  }, [settings.get("compute_server")]);

  // this selector only make sense when compute servers are enabled
  if (!computeServersEnabled()) {
    return null;
  }

  return (
    <Card
      title={
        <>
          <Icon name={"server"} /> Compute Server Configuration
        </>
      }
    >
      <p>
        If enabled, all student projects will have a compute server that is
        configured in the same way as the selected compute server.
      </p>
      <Space wrap>
        <SelectServer
          disabled={!!settings.compute_server_id}
          title="A compute server with identical configuration to this one will be created in each student project."
          fullLabel
          style={{ borderRadius: "5px" }}
          project_id={project_id}
          value={nextVal.compute_server_id}
          setValue={(compute_server_id) => {
            setNextVal({ compute_server_id });
          }}
        />
        <Button
          disabled={!needSave}
          type={needSave ? "primary" : "default"}
          onClick={() => {
            actions.set({ table: "settings", compute_server: nextVal });
            close?.();
          }}
        >
          Save
        </Button>
        <Popconfirm
          title={
            <>
              This will allow you to specify a completely different compute
              server for student projects.
            </>
          }
          onConfirm={() => {
            setNextVal({ compute_server_id: 0 });
          }}
        >
          <Button
            disabled={!settings.getIn(["compute_server", "compute_server_id"])}
          >
            Clear...
          </Button>
        </Popconfirm>
      </Space>
    </Card>
  );
}

export function ComputeServerActions({
  actions,
  project_id,
  settings,
}: {
  actions: CourseActions;
  project_id: string;
  settings;
}) {
  // this selector only make sense when compute servers are enabled
  if (!computeServersEnabled()) {
    return null;
  }

  const compute_server_id = settings.getIn([
    "compute_server",
    "compute_server_id",
  ]);

  const disabled = !compute_server_id;

  return (
    <>
      <Card
        title={
          <>
            <Icon name={"server"} /> Compute Server Actions
          </>
        }
      >
        {!compute_server_id && <div>Please select a compute server.</div>}
        {!!compute_server_id && (
          <div>
            <Space wrap>
              <SelectServer
                disabled={true}
                title="A compute server with identical configuration in each student project."
                fullLabel
                style={{ borderRadius: "5px" }}
                project_id={project_id}
                value={compute_server_id}
              />
              <Button
                disabled={disabled}
                onClick={() => {
                  actions.student_projects.actionAllComputeServers("create");
                }}
              >
                Create
              </Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  actions.student_projects.actionAllComputeServers("start");
                }}
              >
                Start
              </Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  actions.student_projects.actionAllComputeServers("stop");
                }}
              >
                Stop
              </Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  actions.student_projects.actionAllComputeServers("delete");
                }}
              >
                Delete
              </Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  actions.student_projects.actionAllComputeServers(
                    "transfer-to-students",
                  );
                }}
              >
                Transfer
              </Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  actions.student_projects.actionAllComputeServers(
                    "deprovision",
                  );
                }}
              >
                Deprovision
              </Button>
            </Space>
          </div>
        )}
      </Card>
      {!!compute_server_id && (
        <>
          <br />
          <ComputeServerTerminalCommand />
        </>
      )}
    </>
  );
}
