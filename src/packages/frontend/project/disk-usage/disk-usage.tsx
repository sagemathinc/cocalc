import useDiskUsage from "./use-disk-usage";
import { Button, Modal, Progress, Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { human_readable_size } from "@cocalc/util/misc";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components";

export default function DiskUsage({
  project_id,
  path = "",
  compute_server_id = 0,
  style,
}: {
  project_id: string;
  path?: string;
  compute_server_id?: number;
  style?;
}) {
  const [expand, setExpand] = useState<boolean>(false);
  const { usage, loading, error, setError, refresh } = useDiskUsage({
    project_id,
    path,
    compute_server_id,
  });

  const quota = 4000000000;
  const percent = usage == null ? 0 : Math.round((100 * usage.bytes) / quota);

  const btn = (
    <Button onClick={() => setExpand(!expand)} style={style}>
      <Icon name="disk-round" />
      {usage != null && !loading && !path && (
        <Progress
          style={{ width: "40px" }}
          percent={percent}
          status={percent > 80 ? "exception" : undefined}
          showInfo={false}
        />
      )}
      {usage == null ? <Spin /> : human_readable_size(usage.bytes)}{" "}
      {usage != null && loading && <Spin />}
    </Button>
  );

  return (
    <>
      {btn}
      {expand && (
        <Modal
          onOk={() => setExpand(false)}
          onCancel={() => setExpand(false)}
          open
        >
          <ShowError error={error} setError={setError} />
          <h4 style={{ marginTop: 0 }}>
            <Icon name="disk-round" /> Disk Usage:{" "}
            {usage == null ? <Spin /> : human_readable_size(usage.bytes)} in{" "}
            {path ? path : "HOME"}
            <Button
              onClick={() => refresh()}
              style={{ float: "right", marginRight: "30px" }}
            >
              Reload
            </Button>
          </h4>
          {usage != null && (
            <>
              {usage.children.map(({ path, bytes }) => {
                return (
                  <div key={path} style={{ width: "100%", display: "flex" }}>
                    <Progress
                      style={{ flex: 1, marginRight: "30px" }}
                      percent={Math.round((100 * bytes) / usage.bytes)}
                    />{" "}
                    <div style={{ flex: 1 }}> {path}</div>
                  </div>
                );
              })}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
