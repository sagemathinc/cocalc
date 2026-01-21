import { useEffect, useState } from "react";
import { Button, Flex, InputNumber, Modal, Spin, Switch } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  DEFAULT_SNAPSHOT_COUNTS,
  type SnapshotSchedule,
} from "@cocalc/util/consts/snapshots";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

const MAX = 50;

export default function EditSchedule() {
  const { actions, project_id } = useProjectContext();
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const project = useTypedRedux("projects", "project_map")?.get(project_id);
  const openSchedule = useTypedRedux(
    { project_id },
    "open_snapshot_schedule",
  );
  const [schedule0, setSchedule] = useState<SnapshotSchedule | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    actions?.setState({ disableExplorerKeyhandler: true });
    return () => {
      actions?.setState({ disableExplorerKeyhandler: false });
    };
  }, [open]);

  if (project == null) {
    return null;
  }

  useEffect(() => {
    if (!openSchedule || !project) return;
    setSchedule({
      ...DEFAULT_SNAPSHOT_COUNTS,
      ...project.get("snapshots")?.toJS(),
    });
    setOpen(true);
    actions?.setState({ open_snapshot_schedule: false });
  }, [actions, openSchedule, project]);

  const schedule = schedule0!;
  async function saveSchedule() {
    try {
      setLoading(true);
      setError("");
      await webapp_client.query_client.query({
        query: {
          projects: { project_id, snapshots: schedule },
        },
      });
      setOpen(false);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Button
        disabled={open}
        onClick={() => {
          setOpen(!open);
          if (!open) {
            // opening
            setSchedule({
              ...DEFAULT_SNAPSHOT_COUNTS,
              ...project.get("snapshots")?.toJS(),
            });
          }
        }}
      >
        <Icon name="clock" /> Schedule
      </Button>
      {open && (
        <Modal
          title={
            <div style={{ marginBottom: "30px" }}>
              <Icon name="clock" /> Automatic Snapshots:{" "}
              <Switch
                style={{ marginRight: "15px" }}
                checkedChildren="Enabled"
                unCheckedChildren="Disabled"
                checked={!schedule?.disabled}
                onChange={(enabled) =>
                  setSchedule({ ...schedule, disabled: !enabled })
                }
              />
              <Button
                size="small"
                type="text"
                style={{ float: "right", marginRight: "15px" }}
                onClick={() => setShowHelp(!showHelp)}
              >
                Help
              </Button>
              {loading && (
                <Spin style={{ float: "right", marginRight: "15px" }} />
              )}
            </div>
          }
          open={open}
          onCancel={() => {
            setOpen(false);
          }}
          footer={[
            <Button
              key="cancel"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>,
            <Button
              disabled={loading}
              key="create"
              type="primary"
              onClick={saveSchedule}
            >
              Save
            </Button>,
          ]}
        >
          {showHelp && (
            <p>
              Projects have rolling instant lightweight automatic snapshots of
              the exact state of your files, which are created when you are
              actively using your project. The parameters listed below determine
              how many of each timestamped snapshot is retained. Explicitly
              named snapshots that you manually create are not automatically
              deleted.
            </p>
          )}

          {!schedule?.disabled && (
            <div style={{ marginBottom: "15px" }}>
              <Flex style={{ marginBottom: "5px" }}>
                <div style={{ flex: 0.5 }}>Every 15 minutes</div>
                <InputNumber
                  addonAfter="snapshots"
                  precision={0}
                  style={{ flex: 0.5 }}
                  step={1}
                  min={1}
                  max={MAX}
                  defaultValue={
                    schedule.frequent ?? DEFAULT_SNAPSHOT_COUNTS.frequent
                  }
                  onChange={(frequent) => {
                    if (frequent != null) {
                      setSchedule({
                        ...schedule,
                        frequent,
                      });
                    }
                  }}
                />
              </Flex>
              <Flex style={{ marginBottom: "5px" }}>
                <div style={{ flex: 0.5 }}>Daily</div>
                <InputNumber
                  addonAfter="snapshots"
                  style={{ flex: 0.5 }}
                  step={1}
                  min={1}
                  max={MAX}
                  defaultValue={schedule.daily ?? DEFAULT_SNAPSHOT_COUNTS.daily}
                  onChange={(daily) => {
                    if (daily != null) {
                      setSchedule({
                        ...schedule,
                        daily,
                      });
                    }
                  }}
                />
              </Flex>
              <Flex style={{ marginBottom: "5px" }}>
                <div style={{ flex: 0.5 }}>Weekly</div>
                <InputNumber
                  addonAfter="snapshots"
                  style={{ flex: 0.5 }}
                  step={1}
                  min={1}
                  max={MAX}
                  defaultValue={
                    schedule.weekly ?? DEFAULT_SNAPSHOT_COUNTS.weekly
                  }
                  onChange={(weekly) => {
                    if (weekly != null) {
                      setSchedule({
                        ...schedule,
                        weekly,
                      });
                    }
                  }}
                />
              </Flex>
              <Flex>
                <div style={{ flex: 0.5 }}>Monthly</div>
                <InputNumber
                  addonAfter="snapshots"
                  style={{ flex: 0.5 }}
                  step={1}
                  min={1}
                  max={MAX}
                  defaultValue={
                    schedule.monthly ?? DEFAULT_SNAPSHOT_COUNTS.monthly
                  }
                  onChange={(monthly) => {
                    if (monthly != null) {
                      setSchedule({
                        ...schedule,
                        monthly,
                      });
                    }
                  }}
                />
              </Flex>
            </div>
          )}
          <ShowError
            style={{ marginTop: "10px" }}
            error={error}
            setError={setError}
          />
        </Modal>
      )}
    </>
  );
}
