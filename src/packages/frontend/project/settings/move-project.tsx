import { Button, Popconfirm, Spin } from "antd";
import { useActions } from "@cocalc/frontend/app-framework";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";

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
  const actions = useActions("projects");
  const host = useTypedRedux("projects", "project_map")
    ?.getIn([project_id, "host"])
    // @ts-ignore
    ?.toJS();
  const url = host?.public_url ?? host?.internal_url ?? "Not Assigned";

  const text = (
    <div style={{ maxWidth: "300px" }}>
      <div>
        <b>
          Project Host: <code>'{url}'</code>
        </b>
      </div>
      <>You can move this project to another host.</>
      <br />
      Files in <code>/scratch</code> will be lost.
    </div>
  );

  return (
    <Popconfirm
      placement={"bottom"}
      arrow={{ pointAtCenter: true }}
      title={text}
      onConfirm={async () => {
        try {
          setMoving(true);
          await actions.move_project(project_id);
        } catch (err) {
          setError(err);
        } finally {
          setMoving(false);
        }
      }}
      okText={"Move Project"}
    >
      <Button
        disabled={moving || disabled || actions == null}
        size={size}
        danger={force}
      >
        <Icon name="servers" /> {url}
        {moving && <Spin />}
      </Button>
      <ShowError error={error} setError={setError} />
    </Popconfirm>
  );
}
