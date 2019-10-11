import * as React from "react";
import { LabeledRow, TextInput, SettingBox } from "../../r_misc";
import { ProjectsActions } from "../../todo-types";

interface Props {
  project_title: string;
  project_id: string;
  description: string;
  actions: ProjectsActions;
}

export function TitleDescriptionBox(props: Props) {
  return (
    <SettingBox title="Title and description" icon="header">
      <LabeledRow label="Title">
        <TextInput
          text={props.project_title}
          on_change={title =>
            props.actions.set_project_title(props.project_id, title)
          }
        />
      </LabeledRow>
      <LabeledRow label="Description">
        <TextInput
          type="textarea"
          rows={2}
          text={props.description}
          on_change={desc =>
            props.actions.set_project_description(props.project_id, desc)
          }
        />
      </LabeledRow>
    </SettingBox>
  );
}
