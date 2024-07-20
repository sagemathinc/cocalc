/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Paragraph } from "components/misc";
import A from "components/misc/A";
import image from "public/features/cocalc-share-latex-document.png";
import Info from "./info";

export default function Publishing() {
  return (
    <Info
      anchor="a-publishing"
      title="Publishing"
      icon="bullhorn"
      image={image}
      alt="Viewing a PDF file in the share server"
    >
      <Paragraph>
        CoCalc helps you <strong>share your work with the world</strong>. It
        offers its own hosting of <A href="/share">shared documents</A>,
        alongside with any associated data files.
      </Paragraph>
      <Paragraph>
        You can configure if your published files should be listed publicly, or
        rather only be available via a confidential URL.{" "}
      </Paragraph>
    </Info>
  );
}
