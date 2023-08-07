import { Alert, Button, Input, Modal, Space } from "antd";
import { stringify as csvStringify } from "csv-stringify/sync";
import { Set } from "immutable";
import { join } from "path";
import { useCallback, useMemo, useState } from "react";
import { redux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  human_readable_size,
  path_split,
  plural,
  replace_all,
} from "@cocalc/util/misc";
import type { ColumnsType } from "../../fields";

// sort of arbitrary; I know 10MB will blow up, since there is a tight message size limit.
// TODO: eliminate this somehow...
const MAX_SIZE = 5000000;

interface Props {
  type: "json" | "csv";
  title: string;
  onClose: () => void;
  selected: Set<any> | undefined;
  data: object[];
  primaryKey: string;
  columns: ColumnsType[];
}

export default function Export({
  type,
  title,
  onClose,
  selected,
  data,
  primaryKey,
  columns,
}: Props) {
  const { path: curPath, project_id } = useFrameContext();
  const [path, setPath] = useState<string>(
    join(
      path_split(curPath).head,
      `${replace_all(title.toLowerCase(), " ", "-")}.${type}`
    )
  );
  const [state, setState] = useState<"input" | "saving" | "done">("input");
  const [error, setError] = useState<string>("");
  const content = useMemo(() => {
    const records =
      primaryKey != null
        ? data.filter((x) => selected?.has(x[primaryKey]))
        : data;
    if (type == "json") {
      return JSON.stringify(records, undefined, 2);
    } else if (type == "csv") {
      if (records.length == 0) {
        return "";
      }
      const rows: any[] = [columns.map((column) => column.title)];
      const keys = columns.map((column) => column.key);
      for (const record of records) {
        rows.push(keys.map((key) => record[key]));
      }
      return csvStringify(rows);
    } else {
      setError(`unknown type ${type}`);
      return "";
    }
  }, [selected, data, primaryKey]);

  const doExport = useCallback(
    async (path) => {
      try {
        setState("saving");
        if (content.length > MAX_SIZE) {
          throw Error(
            `Too much data to save to project (${human_readable_size(
              content.length
            )}); please select a smaller set of records or less columns.  You can still download this to your computer.`
          );
        }
        await webapp_client.project_client.write_text_file({
          project_id,
          path,
          content,
        });
        setState("done");
      } catch (err) {
        setState("done");
        // this could be implemented - it just isn't...
        setError(`Error writing '${path}' -- ${err}`);
      }
    },
    [selected, data, primaryKey]
  );

  return (
    <Modal
      open
      footer={null}
      title={
        <div style={{ margin: "0 15px" }}>
          <Icon name="file-export" /> Export{" "}
          {primaryKey == null ? "all" : selected?.size}{" "}
          {plural(primaryKey == null ? 2 : selected?.size, "record")} in {type}{" "}
          format from {title} to the following file:
        </div>
      }
      onCancel={onClose}
    >
      <div style={{ margin: "30px 15px" }}>
        <Space.Compact style={{ margin: "15px 0", width: "100%" }}>
          <Input
            disabled={state != "input"}
            style={{ width: "calc(100% - 150px)" }}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onPressEnter={() => doExport(path)}
          />
          <Button
            type="primary"
            onClick={() => doExport(path)}
            disabled={state != "input"}
          >
            Save to project
          </Button>
        </Space.Compact>
        {state == "done" && !error && (
          <div style={{ margin: "30px 0", width: "100%", fontSize: "12pt" }}>
            <a
              onClick={() => {
                onClose();
                redux.getProjectActions(project_id).open_file({
                  path,
                  foreground: true,
                });
              }}
            >
              {path}
            </a>{" "}
            successfully created in your project.
          </div>
        )}
        <div>
          <a
            href={URL.createObjectURL(
              new Blob([content], { type: "text/plain" })
            )}
            download={path_split(path).tail}
          >
            Download {path_split(path).tail} to your computer (size:{" "}
            {human_readable_size(content.length)})
          </a>
        </div>
        {state == "saving" && <Loading text={"Saving"} theme="medium" />}
        {error && (
          <Alert style={{ margin: "15px 0" }} message={error} type="error" />
        )}
      </div>
    </Modal>
  );
}
