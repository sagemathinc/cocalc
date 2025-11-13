import Plot from "@cocalc/frontend/components/plotly";
import { Data } from "./update";
import dayjs from "dayjs";
import { createColors, rgbHex } from "color-map";

interface Props {
  retentionData?: Data[];
}

export default function PlotRetention({ retentionData }: Props) {
  if (retentionData == null) return null;

  const plotData = getPlotData(retentionData);

  const layout = {
    autosize: true,
    xaxis: { title: "Period" },
    yaxis: { title: "Percent Retained Users" },
  };

  return <Plot style={{ height: "100%" }} data={plotData} layout={layout} />;
}

function getPlotData(retentionData) {
  const v: object[] = [];
  const colors = createColors([255, 0, 0], [26, 56, 200], retentionData.length);
  let i = 0;
  for (const data of retentionData) {
    if (data == null) {
      // happens in practice, despite typings (i.e., bug)
      continue;
    }
    const { active, size, start, stop } = data;
    const y = active.map((x) => (100 * x) / Math.max(1, size));
    v.push({
      y,
      type: "scatter",
      mode: "lines",
      marker: { color: rgbHex(colors[i]) },
      name: `${dayjs(start).format("dd MMM D, YYYY h:mm A")} to ${dayjs(
        stop,
      ).format("dd MMM D, YYYY h:mm A")}`,
    });
    i += 1;
  }
  return v;
}
