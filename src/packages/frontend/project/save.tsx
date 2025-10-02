import { useProjectContext } from "./context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useState } from "react";
import { Button, Spin, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components";

export default function Save({
  rootfs = true,
  home = true,
}: {
  rootfs?: boolean;
  home?: boolean;
}) {
  const [saving, setSaving] = useState<boolean>(false);
  const { isRunning, project_id } = useProjectContext();

  if (!rootfs && !home) {
    return null;
  }
  const save = async () => {
    try {
      setSaving(true);
      const runner = webapp_client.conat_client.projectRunner(project_id);
      await runner.save({ home, rootfs });
    } catch (err) {
      console.log("ERROR saving", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tooltip
      title={
        <div>
          {home &&
            rootfs &&
            "Save files in your home directory (/root) and the root filesystem (/)"}
          {home && !rootfs && "Save files in your home directory (HOME=/root)"}
          {!home &&
            rootfs &&
            "Save files in the root filesystem (everything except HOME=/root)"}
          <> to the central file server immediately.</>
          <hr />
          Files save automatically, but you can trigger an immediate save here.
        </div>
      }
    >
      <Button
        disabled={saving || !isRunning}
        onClick={async () => {
          await save();
        }}
      >
        <Icon name="save" /> Save {!rootfs && "HOME"}
        {!home && "Root Files"}
        {saving && (
          <>
            {" "}
            <Spin />
          </>
        )}
      </Button>
    </Tooltip>
  );
}
