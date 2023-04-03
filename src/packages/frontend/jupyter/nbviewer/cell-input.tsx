import { CodeMirrorStatic } from "../codemirror-static";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { InputPrompt } from "../prompt/input-nbviewer";
import ActionButtons from "@cocalc/frontend/editors/slate/elements/code-block/action-buttons";

interface Props {
  cell: object;
  cmOptions: { [field: string]: any };
  project_id?: string;
  directory?: string;
  kernel: string;
  output;
  setOutput;
}

export default function CellInput({
  cell,
  cmOptions,
  kernel,
  output,
  setOutput,
}: Props) {
  const value = cell["input"] ?? "";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      <InputPrompt exec_count={cell["exec_count"]} type={cell["cell_type"]} />
      {cell["cell_type"] == "markdown" ? (
        <Markdown value={value} />
      ) : (
        <div style={{ width: "100%" }}>
          <CodeMirrorStatic
            value={value}
            options={cmOptions}
            addonAfter={
              <ActionButtons
                input={value}
                setOutput={setOutput}
                kernel={kernel}
              />
            }
          />
          {output}
        </div>
      )}
    </div>
  );
}
