import { React } from "../app-framework";

import { COLORS, Icon } from "../r_misc";

export function Connecting(_props) {
  return (
    <div
      style={{
        fontSize: "25px",
        marginTop: "75px",
        textAlign: "center",
        color: COLORS.GRAY,
      }}
    >
      <Icon name="cc-icon-cocalc-ring" spin />{" "}
      Connecting...
    </div>
  );
}
