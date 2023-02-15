import { Alert, Button, Input, Modal } from "antd";
import { Set } from "immutable";
import { path_split, plural } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components/icon";
import { human_readable_size, replace_all } from "@cocalc/util/misc";
import { useCallback, useMemo, useState } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { join } from "path";
import { Loading } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";

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
}

export default function Export({
  type,
  title,
  onClose,
  selected,
  data,
  primaryKey,
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
    return JSON.stringify(
      primaryKey != null
        ? data.filter((x) => selected?.has(x[primaryKey]))
        : data,
      undefined,
      2
    );
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
        <Input.Group compact style={{ margin: "15px 0" }}>
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
        </Input.Group>
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
