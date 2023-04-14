import { FOCUSED_COLOR } from "../../util";

export default function getStyles(focused: boolean = false) {
  const border = `1px solid ${focused ? FOCUSED_COLOR : "transparent"}`;
  return {
    divStyle: { border, display: "flex", justifyContent: "center" },
    tableStyle: {
      borderSpacing: "30px 5px",
      borderCollapse: "separate",
    },
  } as const;
}
