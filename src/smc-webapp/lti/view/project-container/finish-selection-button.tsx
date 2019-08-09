import * as React from "react";

interface Props {
  on_click: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function FinishSelectionButton({ on_click }: Props) {
  return <button onClick={on_click}>Finish</button>;
}
