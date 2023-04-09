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
  history: string[];
}

export default function CellInput({
  cell,
  cmOptions,
  kernel,
  output,
  setOutput,
  history,
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
        <div style={{ overflow: "hidden", flex: 1 }}>
          <CodeMirrorStatic
            value={value}
            options={cmOptions}
            addonBefore={
              <div
                style={{
                  borderBottom: "1px solid #ccc",
                  padding: "3px",
                  display: "flex",
                  background: "#f8f8f8",
                }}
              >
                <div style={{ flex: 1 }} />
                <ActionButtons
                  input={value}
                  output={output}
                  setOutput={setOutput}
                  info={`{kernel='${kernel}'}`}
                  history={history}
                />
              </div>
            }
          />
          {output}
        </div>
      )}
    </div>
  );
}
