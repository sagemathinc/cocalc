import SoftwareLibraries, { renderName } from "./software-libraries";

const COLUMNS = [
  {
    title: "Library",
    key: "library",
    dataIndex: "name",
    render: renderName,
  },
  {
    title: "Version",
    key: "julia",
    dataIndex: "julia",
  },
];

export default function JuliaLibraries() {
  return <SoftwareLibraries prog="julia" maxWidth={40} columns={COLUMNS} />;
}
