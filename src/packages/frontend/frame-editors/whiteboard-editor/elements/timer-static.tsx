import { Element } from "../types";
import { TimeAmount } from "@cocalc/frontend/editors/stopwatch/time";
import { getStyle } from "./text-static";

export default function TimerStatic({ element }: { element: Element }) {
  if (element.data?.countdown != null) {
    return (
      <TimeAmount
        style={getStyle(element, { fontSize: 20 })}
        compact
        amount={element.data?.countdown * 1000 - (element.data?.total ?? 0)}
        countdown={element.data?.countdown}
      />
    );
  } else {
    return <TimeAmount compact amount={element.data?.total ?? 0} />;
  }
}
