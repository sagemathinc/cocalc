import CopyButton from "@cocalc/frontend/components/copy-button";
import RunButton, {
  RunFunction,
  Props as RunButtonProps,
} from "@cocalc/frontend/components/run-button";
export type { RunFunction };

const buttonStyle = { color: "#666", fontSize: "9pt" } as const;

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
      <CopyButton style={buttonStyle} value={input} />
    </>
  );
}
