import * as React from "react";
import { Button } from "../shared";

interface Props {
  on_click: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

export function FinishSelectionButton({ disabled = false, on_click }: Props) {
  return (
    <Button onClick={on_click} disabled={disabled}>
      Select Items
    </Button>
  );
}
