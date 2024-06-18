import { useRef } from "react";
import ReactPlotly from "react-plotly.js";
import useResizeObserver from "use-resize-observer";

export default function Plot(props) {
  const divRef = useRef<HTMLDivElement>(null);
  const resize = useResizeObserver({ ref: divRef });
  return (
    <div ref={divRef}>
      <ReactPlotly
        {...props}
        layout={{ ...props.layout, width: resize.width }}
      />
    </div>
  );
}
