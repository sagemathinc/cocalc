import SoftwareLibraries, { renderName } from "./software-libraries";

const COLUMNS = [
  {
    width: "60%",
    title: "Library",
    key: "library",
    dataIndex: "name",
    render: renderName,
  },
  {
    width: "20%",
    title: "R (systemwide)",
    key: "r",
    dataIndex: "r",
  },
  {
    width: "20%",
    title: "SageMath R",
    key: "sage_r",
    dataIndex: "sage_r",
  },
];

export default function RLibraries() {
  return <SoftwareLibraries prog="R" maxWidth={15} columns={COLUMNS} />;
}
