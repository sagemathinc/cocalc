import { Data } from "./update";
import dayjs from "dayjs";

interface Props {
  data?: Data[];
  startTimes: [dayjs.Dayjs, number][];
  display;
}

export default function PlotActiveUsers({ data, startTimes, display }: Props) {
  if (data == null || (display != "line" && display != "bar")) return null;
  console.log(startTimes);

  return <div>TODO</div>;
}
