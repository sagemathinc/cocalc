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
  info,
  runRef,
}: RunButtonProps) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: 0,
          top: "-3px",
          zIndex: 1,
        }}
      >
        <RunButton
          info={info}
          style={buttonStyle}
          input={input}
          history={history}
          setOutput={setOutput}
          runRef={runRef}
        />
        <CopyButton style={buttonStyle} value={input} />
      </div>
    </div>
  );
}
