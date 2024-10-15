import { useProjectContext } from "@cocalc/frontend/project/context";
import { useRedux } from "@cocalc/frontend/app-framework";
import { PRE_STYLE } from "./action-box";
import { path_split } from "@cocalc/util/misc";

export default function CheckedFiles() {
  const { actions } = useProjectContext();
  const checked_files = useRedux(["checked_files"], actions?.project_id ?? "");

  return (
    <pre style={PRE_STYLE}>
      {checked_files.map((name) => (
        <div key={name}>{path_split(name).tail}</div>
      ))}
    </pre>
  );
}
