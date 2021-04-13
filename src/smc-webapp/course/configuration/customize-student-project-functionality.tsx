import { Card, Checkbox } from "antd";
import { React } from "../../app-framework";
import { Icon } from "../../r_misc";

export interface StudentProjectFunctionality {
  disableDownloads?: boolean;
  disableJupyterToggleReadonly?: boolean;
}

interface Props {
  functionality: StudentProjectFunctionality;
  onChange: (StudentProjectFunctionality) => void;
}

export const CustomizeStudentProjectFunctionality: React.FC<Props> = React.memo(
  ({ functionality, onChange }) => {
    return (
      <Card
        title={
          <>
            <Icon name="envelope" /> Customize student projects
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
            checked={functionality.disableDownloads}
            onChange={(e) =>
              onChange({ disableDownloads: (e.target as any).checked })
            }
          >
            Disable all file downloads
          </Checkbox>
          <br />

          <Checkbox
            checked={functionality.disableJupyterToggleReadonly}
            onChange={(e) =>
              onChange({
                disableJupyterToggleReadonly: (e.target as any).checked,
              })
            }
          >
            Disable toggle of read-only state of cells in Jupyter notebooks
          </Checkbox>
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          Check either of the boxes above to remove the corresponding
          functionality from student projects. This is useful to reduce student
          confusion and keep the students more focused. Do not use these to
          prevent highly motivated cheaters, since a very resourceful and
          knowledgeable student can likely get around these constraints, e.g.,
          by using a command line terminal or doing a bunch of copying and
          pasting. Use the above instead to reduce the chances students get
          confused and mess up their work.
        </span>
      </Card>
    );
  }
);
