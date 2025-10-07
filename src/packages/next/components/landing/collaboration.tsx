/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Paragraph } from "components/misc";
import A from "components/misc/A";
import { StaticImageData } from "./image";
import Info from "./info";

interface Props {
  image: StaticImageData;
  alt?: string;
  children?: React.ReactNode;
}

export default function Collaboration(props: Props) {
  const {
    image,
    alt = "Editing a document in two browser windows",
    children,
  } = props;
  return (
    <Info
      anchor="a-realtimesync"
      icon="users"
      title="Collaborative editing without limits"
      image={image}
      alt={alt}
    >
      {children ?? (
        <>
          <Paragraph>
            Privately share your project with{" "}
            <A href="https://doc.cocalc.com/project-settings.html#about-collaborators">
              <strong>an unlimited number of collaborators</strong>
            </A>
            . Simultaneous modifications of your document are{" "}
            <strong>synchronized in real time</strong>. You see the cursors of
            others while they edit the document and also see the presence of
            watching collaborators.
          </Paragraph>

          <Paragraph>
            Additionally, any compilation status and output is synchronized
            between everyone, because everything runs online and is fully
            managed by CoCalc.
          </Paragraph>

          <Paragraph>
            This ensures that everyone involved experiences editing the document
            in exactly the same way.
          </Paragraph>
        </>
      )}
    </Info>
  );
}
