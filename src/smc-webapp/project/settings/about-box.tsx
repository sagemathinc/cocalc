import * as React from "react";
import { LabeledRow, TextInput, SettingBox, TimeAgo } from "../../r_misc";
import { ProjectsActions } from "../../todo-types";

interface Props {
  project_title: string;
  project_id: string;
  description: string;
  created?: Date;
  actions: ProjectsActions;
}

export function AboutBox(props: Props) {
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
      {props.created && (
        <LabeledRow label="Created">
          <TimeAgo date={props.created} />
        </LabeledRow>
      )}
    </SettingBox>
  );
}
