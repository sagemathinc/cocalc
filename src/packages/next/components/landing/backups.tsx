import Link from "next/link";
import Info from "./info";
import A from "components/misc/A";

export default function Backups() {
  return (
    <Info
      anchor="a-backups"
      title="Backups"
      icon="life-saver"
      image="cocalc-backup-1.png"
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
        <Link href="#a-timetravel">
          <a>TimeTravel</a>
        </Link>{" "}
        and provides browseable backups of images and data files in addition to
        the documents you are actively working on.
      </p>
    </Info>
  );
}
