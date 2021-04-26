/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { isEqual } from "lodash";
import { Card, Checkbox } from "antd";
import { Button } from "smc-webapp/antd-bootstrap";
import {
  React,
  useEffect,
  useIsMountedRef,
  useState,
  useTypedRedux,
} from "smc-webapp/app-framework";
import { Icon } from "smc-webapp/r_misc";

export interface StudentProjectFunctionality {
  disableActions?: boolean;
  disableJupyterToggleReadonly?: boolean;
  disableJupyterClassicServer?: boolean;
  disableJupyterLabServer?: boolean;
  disableTerminals?: boolean;
  disableUploads?: boolean;
  disableNetwork?: boolean;
  disableSSH?: boolean;
}

interface Props {
  functionality: StudentProjectFunctionality;
  onChange: (StudentProjectFunctionality) => Promise<void>;
}

export const CustomizeStudentProjectFunctionality: React.FC<Props> = React.memo(
  ({ functionality, onChange }) => {
    const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
    const [changed, setChanged] = useState<boolean>(false);
    const [state, setState] = useState<StudentProjectFunctionality>(
      functionality
    );
    const [saving, setSaving] = useState<boolean>(false);
    function onChangeState(obj: StudentProjectFunctionality) {
      const newState = { ...state };
      setChanged(true);
      for (const key in obj) {
        newState[key] = obj[key];
      }
      setState(newState);
    }
    const isMountedRef = useIsMountedRef();

    useEffect(() => {
      // upstream change (e.g., another user editing these)
      setState(functionality);
    }, [functionality]);

    return (
      <Card
        title={
          <>
            <Icon name="lock" /> Restrict student projects
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
            disabled={saving}
            checked={state.disableActions}
            onChange={(e) =>
              onChangeState({ disableActions: (e.target as any).checked })
            }
          >
            Disable file actions: deleting, downloading, copying and publishing
            of files
          </Checkbox>
          <br />
          <Checkbox
            disabled={saving}
            checked={state.disableJupyterToggleReadonly}
            onChange={(e) =>
              onChangeState({
                disableJupyterToggleReadonly: (e.target as any).checked,
              })
            }
          >
            Disable toggling of whether cells are editable or deletable in
            Jupyter notebooks (also disables the RAW JSON editor and the command
            list dialog)
          </Checkbox>
          <br />
          <Checkbox
            disabled={saving}
            checked={state.disableJupyterClassicServer}
            onChange={(e) =>
              onChangeState({
                disableJupyterClassicServer: (e.target as any).checked,
              })
            }
          >
            Disable Jupyter Classic notebook server, which provides its own
            extensive download and edit state.
          </Checkbox>{" "}
          <br />
          <Checkbox
            disabled={saving}
            checked={state.disableJupyterLabServer}
            onChange={(e) =>
              onChangeState({
                disableJupyterLabServer: (e.target as any).checked,
              })
            }
          >
            Disable JupyterLab notebook server, which provides its own extensive
            download and edit state.
          </Checkbox>
          <br />
          <Checkbox
            disabled={saving}
            checked={state.disableTerminals}
            onChange={(e) =>
              onChangeState({
                disableTerminals: (e.target as any).checked,
              })
            }
          >
            Disable command line terminal
          </Checkbox>
          <br />
          <Checkbox
            disabled={saving}
            checked={state.disableUploads}
            onChange={(e) =>
              onChangeState({
                disableUploads: (e.target as any).checked,
              })
            }
          >
            Disable files uploads
          </Checkbox>
          <br />
          {isCoCalcCom && (
            <>
              <Checkbox
                disabled={saving}
                checked={state.disableNetwork}
                onChange={(e) =>
                  onChangeState({
                    disableNetwork: (e.target as any).checked,
                  })
                }
              >
                Disable outgoing network access
              </Checkbox>
              <br />
            </>
          )}
          {isCoCalcCom && (
            <Checkbox
              disabled={saving}
              checked={state.disableSSH}
              onChange={(e) =>
                onChangeState({
                  disableSSH: (e.target as any).checked,
                })
              }
            >
              Disable SSH access to project
            </Checkbox>
          )}
          {(changed || !isEqual(functionality, state)) && (
            <div>
              <Button
                disabled={saving || isEqual(functionality, state)}
                onClick={async () => {
                  setSaving(true);
                  await onChange(state);
                  if (isMountedRef.current) {
                    setSaving(false);
                  }
                }}
                bsStyle={"success"}
              >
                Save changes
              </Button>
            </div>
          )}
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          Check any of the boxes above to remove the corresponding functionality
          from student projects. This is useful to reduce student confusion and
          keep the students more focused, e.g., during an exam.{" "}
          <i>
            Do not gain a false sense of security and expect these to prevent
            very highly motivated cheaters!
          </i>{" "}
          -- a resourceful and knowledgeable student could potentially get
          around these constraints, e.g., by doing a bunch of copying and
          pasting by hand. Use the above features to also reduce the chances
          students get confused and mess up their work. For example, you might
          want to disable Jupyter classic in a class that is using JupyterLab
          extensively.
        </span>
      </Card>
    );
  }
);

// NOTE: we allow project_id to be undefined for convenience since some clients
// were written with that unlikely assumption on their knowledge of project_id.
export const useStudentProjectFunctionality = (project_id?: string) => {
  const project_map = useTypedRedux("projects", "project_map");
  const [state, setState] = useState<StudentProjectFunctionality>(
    project_map
      ?.getIn([project_id ?? "", "course", "student_project_functionality"])
      ?.toJS() ?? {}
  );
  useEffect(() => {
    setState(
      project_map
        ?.getIn([project_id ?? "", "course", "student_project_functionality"])
        ?.toJS() ?? {}
    );
    return;
  }, [
    project_map?.getIn([
      project_id ?? "",
      "course",
      "student_project_functionality",
    ]),
  ]);

  return state;
};
