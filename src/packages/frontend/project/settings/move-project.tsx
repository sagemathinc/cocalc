import { Button, Popconfirm } from "antd";
import { useActions, useAsyncEffect } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useState } from "react";

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
  const actions = useActions("projects");
  const [counter, setCounter] = useState<number>(0);
  const [server, setServer] = useState<string | null>(null);
  useAsyncEffect(async () => {
    const runner = webapp_client.conat_client.projectRunner(project_id);
    setServer((await runner.status()).server ?? null);
  }, [project_id, counter]);

  const text = (
    <div style={{ maxWidth: "300px" }}>
      {server && (
        <h4>
          Hosted on <code>'{server}'</code>
        </h4>
      )}
      {force ? (
        <>
          Forcing the project to move will move it even if it didn't save all
          files to the file server. <b>This is potentially dangerous</b> but you
          can verify your files are on the central server by browsing in the
          file explorer.
        </>
      ) : (
        <>
          You can move this project to another runner, if one is available.
          Moving may take a few minutes.
        </>
      )}
    </div>
  );

  return (
    <Popconfirm
      placement={"bottom"}
      arrow={{ pointAtCenter: true }}
      title={text}
      onConfirm={async () => {
        await actions.move_project(project_id, force);
        setCounter(counter + 1);
      }}
      okText={`${force ? "Force " : ""}Move Project`}
    >
      <Button disabled={disabled || actions == null} size={size} danger={force}>
        Hosted on "{server}"...
      </Button>
    </Popconfirm>
  );
}
