import * as React from "react";

interface Props {
  on_click: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}

export function FinishSelectionButton({ disabled = false, on_click }: Props) {
  return (
    <button onClick={on_click} disabled={disabled}>
      Finish
    </button>
  );
}

