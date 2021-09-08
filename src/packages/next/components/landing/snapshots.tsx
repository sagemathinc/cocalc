import { ReactNode } from "react";
import A from "components/misc/A";
import Info from "./info";
import image from "public/doc/cocalc-snapshots.png";

interface Props {
  children?: ReactNode;
}

export default function Snapshots({ children }: Props) {
  return (
    <Info
      title="Snapshot backups"
      image={image}
      icon="life-saver"
      anchor="a-snapshot-backups"
      alt="Browsing filesystem snapshots in a CoCalc project"
      rows
    >
      <p>
        <strong>Snapshots</strong> are consistent read-only views of all your
        files in a{" "}
        <A href="https://doc.cocalc.com/project.html">CoCalc project</A>. You
        can restore your files by copying back any that you accidentally deleted
        or corrupted.
      </p>
      {children}
    </Info>
  );
}
