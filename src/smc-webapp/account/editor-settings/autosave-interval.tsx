import { React } from "../../app-framework";
import { LabeledRow, NumberInput } from "../../r_misc";

interface Props {
  autosave: number;
  on_change: (string, number) => void;
}

export function EditorSettingsAutosaveInterval(props: Props): JSX.Element {
  return (
    <LabeledRow label="Autosave interval">
      <NumberInput
        on_change={(n) => props.on_change("autosave", n)}
        min={15}
        max={900}
        number={props.autosave}
        unit="seconds"
      />
    </LabeledRow>
  );
}
