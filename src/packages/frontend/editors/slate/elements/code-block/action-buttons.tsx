import CopyButton from "@cocalc/frontend/components/copy-button";
import RunButton, {
  RunFunction,
  Props as RunButtonProps,
} from "@cocalc/frontend/components/run-button";
export type { RunFunction };

const buttonStyle = { color: "#666" } as const;

export default function ActionButtons(props: RunButtonProps) {
  return (
    <>
      <CopyButton style={buttonStyle} value={props.input} size={props.size} />
      <div style={{ width: "5px" }} />
      <RunButton {...props} style={buttonStyle} />
    </>
  );
}
