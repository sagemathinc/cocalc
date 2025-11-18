import useDiskUsage from "./use-disk-usage";
import { Alert, Button, Modal, Progress, Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { human_readable_size } from "@cocalc/util/misc";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { redux } from "@cocalc/frontend/app-framework";
import { dirname } from "path";

export default function DiskUsage({
  project_id,
  compute_server_id = 0,
  style,
}: {
  project_id: string;
  compute_server_id?: number;
  style?;
}) {
  const [expand, setExpand] = useState<boolean>(false);
  const { usage, loading, error, setError, refresh, quota } = useDiskUsage({
    project_id,
    compute_server_id,
  });

  if (!quota?.size) {
    return null;
  }

  const percent =
    usage == null || quota == null
      ? 0
      : Math.round((100 * usage.bytes) / quota?.size);
  const status = percent > 80 ? "exception" : undefined;

  const btn = (
    <Button
      onClick={() => {
        refresh();
        setExpand(!expand);
      }}
      style={style}
    >
      <Icon name="disk-round" />
      {usage != null && (
        <Progress
          style={{ width: "40px" }}
          percent={percent}
          status={status}
          showInfo={false}
        />
      )}
      {usage == null ? <Spin delay={1000} /> : undefined}
      {usage != null && loading && <Spin delay={1000} />}
    </Button>
  );

  const total = Math.max(usage?.bytes ?? 1, 1);
  return (
    <>
      {btn}
      {expand && (
        <Modal
          onOk={() => setExpand(false)}
          onCancel={() => setExpand(false)}
          open
          width={600}
        >
          <ShowError error={error} setError={setError} />
          <h5 style={{ marginTop: 0 }}>
            <Icon name="disk-round" /> Disk Usage:{" "}
            {usage == null ? (
              <Spin delay={1000} />
            ) : (
              human_readable_size(usage.bytes)
            )}
            {quota != null && <> out of {human_readable_size(quota.size)} </>}
            <Button
              onClick={() => refresh()}
              style={{ float: "right", marginRight: "30px" }}
            >
              Reload
            </Button>
          </h5>
          {usage != null && quota != null && (
            <div style={{ textAlign: "center" }}>
              <Progress
                type="circle"
                percent={percent}
                status={status}
                format={() => `${percent}%`}
              />
            </div>
          )}
          {percent >= 100 && (
            <Alert
              style={{ margin: "15px 0" }}
              showIcon
              message="OVER QUOTA"
              description="Delete files or increase your quota."
              type="error"
            />
          )}
          {usage != null && (
            <div>
              <hr />
              {usage.children
                .filter((x) => x.bytes / total > 0.01)
                .map(({ path, bytes }) => {
                  return (
                    <div key={path} style={{ width: "100%", display: "flex" }}>
                      <Progress
                        style={{ flex: 1, marginRight: "30px" }}
                        percent={Math.round((100 * bytes) / total)}
                      />{" "}
                      <a
                        style={{ flex: 1 }}
                        onClick={async () => {
                          const actions = redux.getProjectActions(project_id);
                          const fs = actions.fs(compute_server_id);
                          const stats = await fs.stat(path);
                          const p = stats.isDirectory() ? path : dirname(path);
                          actions.set_current_path(p);
                          setExpand(false);
                        }}
                      >
                        {" "}
                        {path}
                      </a>
                    </div>
                  );
                })}
            </div>
          )}
          {quota != null && (
            <div>
              <hr />
              <div style={{ display: "flex" }}>
                <div style={{ marginRight: "30px" }}>
                  <b>Hard Quota:</b>
                </div>
                <Progress
                  style={{ flex: 1 }}
                  percent={Math.round(
                    (100 * quota.used) / Math.max(quota.size, 1),
                  )}
                  status={
                    quota.used / Math.max(quota.size, 1) > 0.6
                      ? "exception"
                      : quota.used / Math.max(quota.size, 1) < 0.4
                        ? "success"
                        : undefined
                  }
                />
              </div>
              You are using {human_readable_size(quota.used)} out of{" "}
              {human_readable_size(quota.size)}.{" "}
              <span style={{ color: "#666" }}>
                The value {human_readable_size(quota.used)} may be much lower
                than the total space you are using, due to compression,
                deduplication, accounting lag, and other factors, and gives you
                flexibility to remove files before running out of space.
              </span>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
