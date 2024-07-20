/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Customize } from "lib/share/customize";
import PublicPaths from "components/share/public-paths";
import { Layout } from "components/share/layout";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  stars;
  customize;
}

export default function Stars({ customize, stars }: Props) {
  return (
    <Customize value={customize}>
      <Layout title={"Your Stars"}>
        <h1>
          <Icon name="star-filled" /> Your Stars
        </h1>
        You can star anything that is <A href="/share">shared publicly</A> and
        it will appear in the list below.
        <br />
        <br />
        <PublicPaths publicPaths={stars} />
      </Layout>
    </Customize>
  );
}
