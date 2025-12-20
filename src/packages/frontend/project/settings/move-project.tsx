import { Button, Spin } from "antd";
import { useActions } from "@cocalc/frontend/app-framework";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { HostPickerModal } from "@cocalc/frontend/hosts/pick-host";

interface Props {
  project_id: string;
  disabled?: boolean;
  size?;
  force?: boolean;
}

export default function MoveProject({
  project_id,
  disabled,
  size,
  force,
}: Props) {
  const [moving, setMoving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const actions = useActions("projects");
  const host = useTypedRedux("projects", "project_map")
    ?.getIn([project_id, "host"])
    // @ts-ignore
    ?.toJS();
  const url = host?.public_url ?? host?.internal_url;
  const hostName = host?.name ?? url ?? "Not Assigned";
  const currentHostId = useTypedRedux("projects", "project_map")?.getIn([
    project_id,
    "host_id",
  ]) as string | undefined;

  return (
    <>
      <Button
        disabled={moving || disabled || actions == null}
        size={size}
        danger={force}
        onClick={async () => {
          try {
            setMoving(true);
            setPickerOpen(true);
          } catch (err) {
            setError(`${err}`);
          } finally {
            setMoving(false);
          }
        }}
      >
        <Icon name="servers" />{" "}
        <span
          style={{
            maxWidth: "180px",
            display: "inline-block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            verticalAlign: "middle",
          }}
          title={hostName || url || "Not Assigned"}
        >
          Move (current: {hostName})
        </span>
        {moving && <Spin />}
      </Button>
      <ShowError error={error} setError={setError} />
      <HostPickerModal
        open={pickerOpen}
        currentHostId={currentHostId}
        onCancel={() => setPickerOpen(false)}
        onSelect={async (dest_host_id) => {
          setPickerOpen(false);
          try {
            setMoving(true);
            await actions.move_project_to_host(project_id, dest_host_id);
          } catch (err) {
            setError(`${err}`);
          } finally {
            setMoving(false);
          }
        }}
      />
    </>
  );
}
