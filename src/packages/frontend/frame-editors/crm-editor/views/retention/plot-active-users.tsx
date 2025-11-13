import Plot from "@cocalc/frontend/components/plotly";
import { Data } from "./update";
import dayjs from "dayjs";

interface Props {
  data?: Data;
  startTimes: [dayjs.Dayjs, number][];
  display;
}

export default function PlotActiveUsers({ data, startTimes, display }: Props) {
  if (data == null || (display != "line" && display != "bar")) return null;

  const { active } = data;

  // Calculate timestamps for each data point
  const timestamps = startTimes.map((x) => x[0].toDate().toISOString());

  const plotData = getPlotData(display, timestamps, active);

  const layout = {
    xaxis: { title: "Timestamp" },
    yaxis: { title: "Active Users" },
  };

  return <Plot data={plotData} layout={layout} />;
}

function getPlotData(display, timestamps, active) {
  if (display == "line") {
    return [
      {
        x: timestamps,
        y: active,
        type: "scatter",
        mode: "lines",
        marker: { color: "lightgrey" },
        name: "Active Users",
      },
      {
        x: timestamps,
        y: active,
        type: "scatter",
        mode: "markers",
        marker: { color: "#1677ff" },
        name: "Active Users",
      },
    ];
  } else if (display == "bar") {
    return [
      {
        x: timestamps,
        y: active,
        type: "bar",
        marker: { color: "#91caff" },
        name: "Active Users",
      },
    ];
  } else return [];
}
