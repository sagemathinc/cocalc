import CopyButton from "@cocalc/frontend/components/copy-button";
import RunButton, {
  RunFunction,
  Props as RunButtonProps,
} from "@cocalc/frontend/components/run-button";
export type { RunFunction };

const buttonStyle = { color: "#666" } as const;

export default function ActionButtons({
  input,
  history,
  setOutput,
  output,
  info,
  runRef,
}: RunButtonProps) {
  return (
    <>
      <RunButton
        info={info}
        style={buttonStyle}
        input={input}
        history={history}
        setOutput={setOutput}
        output={output}
        runRef={runRef}
      />
      <div style={{ width: "5px" }} />
      <CopyButton style={buttonStyle} value={input} />
    </>
  );
}
