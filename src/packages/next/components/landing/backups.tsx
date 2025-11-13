/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Paragraph } from "components/misc";
import A from "components/misc/A";
import Info from "./info";

import image from "public/features/cocalc-backup-1.png";

export default function Backups() {
  return (
    <Info
      anchor="a-backups"
      title="Backups"
      icon="life-saver"
      image={image}
      alt="Directory listing of filesystem backups of a CoCalc project"
      wide
    >
      <Paragraph>
        Every couple of minutes,{" "}
        <strong>
          all files in your project are saved in consistent readonly snapshots{" "}
          <A href="https://en.wikipedia.org/wiki/ZFS">using ZFS</A>
        </strong>
        .
      </Paragraph>
      <Paragraph>
        This means you can recover older versions of your files in case they are
        corrupted or accidentally deleted.{" "}
      </Paragraph>
      <Paragraph>
        These backups are complementary to{" "}
        <A href="#a-timetravel">TimeTravel</A> and provide browsable backups of
        images and data files in addition to the documents you are actively
        editing.
      </Paragraph>
    </Info>
  );
}
