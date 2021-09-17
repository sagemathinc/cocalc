import SoftwareLibraries, { renderName } from "./software-libraries";

const COLUMNS = [
  {
    width: "40%",
    title: "Library",
    key: "library",
    dataIndex: "name",
    render: renderName,
  },
  {
    width: "15%",
    title: "Python 3",
    key: "python3",
    dataIndex: "python3",
  },
  {
    width: "15%",
    title: "SageMath",
    key: "sage",
    dataIndex: "sage",
  },
  {
    width: "15%",
    title: "Anaconda 2020",
    key: "anaconda",
    dataIndex: "anaconda",
  },
  {
    width: "15%",
    title: "Python 2",
    key: "python2",
    dataIndex: "python2",
  },
];

export default function PythonLibraries() {
  return <SoftwareLibraries prog="python" maxWidth={15} columns={COLUMNS} />;
}
