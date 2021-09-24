/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useState } from "react";
import { Alert } from "antd";

import {
  LabeledRow,
  TextInput,
  SettingBox,
  TimeAgo,
} from "@cocalc/frontend/components";
import { ProjectsActions } from "@cocalc/frontend/todo-types";

interface Props {
  project_title: string;
  project_id: string;
  name?: string;
  description: string;
  created?: Date;
  actions: ProjectsActions;
}

export function AboutBox(props: Props) {
  const [showNameInfo, setShowNameInfo] = useState<boolean>(false);
  return (
    <SettingBox title="About" icon="file-alt">
      <LabeledRow label="Title">
        <TextInput
          text={props.project_title}
          on_change={(title) =>
            props.actions.set_project_title(props.project_id, title)
          }
        />
      </LabeledRow>
      <LabeledRow label="Description">
        <TextInput
          type="textarea"
          rows={2}
          text={props.description}
          on_change={(desc) =>
            props.actions.set_project_description(props.project_id, desc)
          }
        />
      </LabeledRow>
      <LabeledRow label="Name (optional)">
        <TextInput
          type="textarea"
          rows={1}
          text={props.name ?? ""}
          on_change={(name) =>
            props.actions.set_project_name(props.project_id, name)
          }
          onFocus={() => setShowNameInfo(true)}
          onBlur={() => setShowNameInfo(false)}
        />
        {showNameInfo && (
          <Alert
            style={{ margin: "15px 0" }}
            message={
              "The project name is currently only used to provide better URL's for publicly shared documents. It can be at most 100 characters long and must be unique among all projects you own. Only the project owner can change the project name." +
              (props.name
                ? " TEMPORARY WARNING: If you change the project name, existing public shared links using the previous name will break, so change with caution."
                : "")
            }
            type="info"
          />
        )}
      </LabeledRow>
      {props.created && (
        <LabeledRow label="Created">
          <TimeAgo date={props.created} />
        </LabeledRow>
      )}
    </SettingBox>
  );
}
