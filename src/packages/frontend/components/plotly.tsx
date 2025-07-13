import { useEffect, useRef, useState } from "react";
import useResizeObserver from "use-resize-observer";
import { Spin } from "antd";

export default function Plot(props) {
  const divRef = useRef<HTMLDivElement>(null as any);
  const resize = useResizeObserver({ ref: divRef });
  const [reactPlotlyjs, setReactPlotlyjs] = useState<any>(null);

  useEffect(() => {
    (async () => {
      // load only when actually used, since this involves dynamic load over the internet,
      // and we don't want loading cocalc in an airgapped network to have hung network requests,
      // and this Plot functionality is only used very little.
      // NOTE: I tried a number of variants on what exactly to import
      // and what to assign, and this works, but some other obvious things,
      // like just saving reactPlotlyjs.default, do NOT.
      const reactPlotlyjs = await import("react-plotly.js");
      setReactPlotlyjs(reactPlotlyjs);
    })();
  }, []);

  return (
    <div ref={divRef} style={props.style}>
      {reactPlotlyjs != null ? (
        <reactPlotlyjs.default
          {...props}
          layout={{ ...props.layout, width: resize.width }}
        />
      ) : (
        <Spin />
      )}
    </div>
  );
}
