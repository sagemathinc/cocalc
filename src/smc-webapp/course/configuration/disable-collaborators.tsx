import { Card, Checkbox } from "antd";
import { React } from "../../app-framework";
import { Icon } from "../../r_misc";

interface Props {
  checked: boolean;
  on_change: (checked: boolean) => void;
}

export const DisableStudentCollaboratorsPanel: React.FC<Props> = React.memo(
  ({ checked, on_change }) => {
    return (
      <Card
        title={
          <>
            <Icon name="envelope" /> Collaborator policy
          </>
        }
      >
        <div
          style={{
            border: "1px solid lightgrey",
            padding: "10px",
            borderRadius: "5px",
          }}
        >
          <Checkbox
            checked={checked}
            onChange={(e) => on_change((e.target as any).checked)}
          >
            Allow arbitrary collaborators
          </Checkbox>
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          If this box is checked (this is the default), the owner and any
          collaborator on this student project may add collaborators to this
          project. If this box is not checked, any collaborators on this student
          project will be removed, with the exception of the student,
          instructor, and TAs. Here "instructor and TAs" means any user who is
          an owner or collaborator on the teaching project, i.e. the project
          containing the course file. After "Allow arbitrary collaborators" is
          checked, collaborators to be excluded are removed when opening the
          course file or upon clicking "Reconfigure all projects".
        </span>
      </Card>
    );
  }
);
