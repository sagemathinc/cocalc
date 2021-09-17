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
    key: "octave",
    dataIndex: "Octave",
  },
];

export default function OctaveLibraries() {
  return <SoftwareLibraries prog="octave" maxWidth={40} columns={COLUMNS} />;
}
