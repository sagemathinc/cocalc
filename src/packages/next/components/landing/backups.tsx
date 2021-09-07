import Info from "./info";
import A from "components/misc/A";

export default function Backups() {
  return (
    <Info
      anchor="a-backups"
      title="Backups"
      icon="life-saver"
      image="cocalc-backup-1.png"
      alt="Directory listing of filesystem backups of a CoCalc project"
      rows
    >
      <p>
        Every couple of minutes,{" "}
        <strong>
          all files in your project are saved in consistent readonly snapshots{" "}
          <A href="https://en.wikipedia.org/wiki/ZFS">using ZFS</A>
        </strong>
        .
      </p>
      <p>
        This means you can recover older versions of your files in case they are
        corrupted or accidentally deleted.{" "}
      </p>
      <p>
        These backups are complementary to{" "}
        <A href="#a-timetravel">TimeTravel</A> and provides browseable backups
        of images and data files in addition to the documents you are actively
        working on.
      </p>
    </Info>
  );
}
