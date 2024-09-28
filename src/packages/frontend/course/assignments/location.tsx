/*
Configure the location of this assignment.

The location is one of these:

- 'individual': Student's personal project (the default)
- 'exam': Student's exam project \- they only have access **during the exam**
- 'group': Group project \- need nice ui to divide students into groups and let instructor customize

The location can't be changed once any assignments have been assigned.

This component is responsible for:

- Displaying the selected location
- Changing the location
- Editing the groups in case of 'group'
*/

import { useState } from "react";
import type { AssignmentLocation, AssignmentRecord } from "../store";
import type { CourseActions } from "../actions";
import { Alert, Button, Divider, Modal, Radio, Tooltip } from "antd";
import type { CheckboxOptionType } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

const LOCATIONS = {
  individual: {
    color: "#006ab5",
    icon: "user",
    label: "Individual",
    desc: "their own personal course project",
  },
  exam: {
    color: "darkgreen",
    icon: "graduation-cap",
    label: "Exam",
    desc: "an exam-specific project that they have access to only during the exam",
  },
  group: {
    color: "#8b0000",
    icon: "users",
    label: "Group",
    desc: "an assignment-specific project with a configurable group of other students",
  },
};

export default function Location({
  assignment,
  actions,
}: {
  assignment: AssignmentRecord;
  actions: CourseActions;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const location = getLocation(assignment);
  const { icon, label, desc, color } = LOCATIONS[location] ?? {
    label: "Bug",
    icon: "bug",
  };
  return (
    <>
      {open && (
        <EditLocation
          assignment={assignment}
          actions={actions}
          setOpen={setOpen}
        />
      )}
      <Tooltip
        title={
          <>
            Students work on their copy of '{assignment.get("path")}' in {desc}.
          </>
        }
      >
        <Button onClick={() => setOpen(true)}>
          <span style={{ color }}>
            <Icon name={icon} /> {label}
          </span>
        </Button>
      </Tooltip>
    </>
  );
}

function EditLocation({ assignment, actions, setOpen }) {
  const last_assignment = assignment.get("last_assignment");
  let disabled = false;
  if (last_assignment != null) {
    const store = actions.get_store();
    const status = store?.get_assignment_status(
      assignment.get("assignment_id"),
    );
    if ((status?.assignment ?? 0) > 0) {
      disabled = true;
    }
  }
  const options: CheckboxOptionType[] = [];
  const curLocation = getLocation(assignment);
  for (const location in LOCATIONS) {
    const { icon, label, desc, color } = LOCATIONS[location];
    options.push({
      label: (
        <div style={{ margin: "5px 0" }}>
          <span style={{ color }}>
            <Icon name={icon} /> <b>{label}</b>{" "}
          </span>{" "}
          - students work in {desc}
        </div>
      ),
      value: location,
      disabled: disabled && location != curLocation,
    });
  }
  return (
    <Modal
      open
      title={
        <>
          <Icon name="global" /> Location Where Students Work on '
          {assignment.get("path")}'
        </>
      }
      onCancel={() => setOpen(false)}
      onOk={() => setOpen(false)}
      cancelButtonProps={{ style: { display: "none" } }}
      okText="Close"
    >
      <Radio.Group
        options={options}
        value={curLocation}
        onChange={(e) => {
          actions.assignments.setLocation(
            assignment.get("assignment_id"),
            e.target.value,
          );
        }}
      />
      {disabled && (
        <Alert
          style={{ marginTop: "10px" }}
          showIcon
          type="warning"
          message="Location cannot be changed since work has been copied out."
        />
      )}
      {curLocation == "group" && (
        <GroupConfiguration
          assignment={assignment}
          actions={actions}
          disabled={disabled}
        />
      )}
    </Modal>
  );
}

function getLocation(assignment): AssignmentLocation {
  const location = assignment.get("location") ?? "individual";
  if (location == "individual" || location == "exam" || location == "group") {
    return location;
  }
  return "individual";
}

function getGroups(assignment) {
  const groups = assignment.get("groups")?.toJS();
  if (groups == null || typeof groups != "object") {
    return {};
  }
  return groups;
}

function GroupConfiguration({ assignment, actions, disabled }) {
  const groups = getGroups(assignment);
  console.log({ assignment, actions, disabled });
  return (
    <div>
      <Divider>Group Configuration</Divider>
      TODO: Group configuration for assignment: {JSON.stringify(groups)}
    </div>
  );
}
