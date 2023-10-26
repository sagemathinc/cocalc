// import { Table } from "antd";
// import { TimeAgo } from "@cocalc/frontend/components";
// import { capitalize } from "@cocalc/util/misc";

export default function DetailedState({ detailed_state }) {
  const v: JSX.Element[] = [];
  for (const name in detailed_state) {
    v.push(<State name={name} {...detailed_state[name]} />);
  }
  return <div>{v}</div>
}

// function toLabel(name: string) {
//   return name
//     .split("-")
//     .map((x) => capitalize(x))
//     .join(" ");
// }

function State({ name, value, time, expire, progress, extra }) {
  return (
    <div>{JSON.stringify({ name, value, time, expire, progress, extra })}</div>
  );
}
