/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Customize } from "lib/share/customize";
import { Layout } from "components/share/layout";
import A from "components/misc/A";
import DirectoryListing from "components/share/directory-listing";
import { Alert } from "antd";
import { capitalize } from "@cocalc/util/misc";
import SiteName from "components/share/site-name";
import Avatar from "./avatar";

interface Props {
  organization: string;
  customize;
  contents;
  error?: string;
}

export default function Organization({
  customize,
  contents,
  error,
  organization,
}: Props) {
  return (
    <Customize value={customize}>
      <Layout title={`GitHub - ${organization}`}>
          <Avatar name={organization} style={{ float: "right" }}/>
        <h1>{capitalize(organization)}'s GitHub Repositories</h1>
        These are the{" "}
        <A href={`https://github.com/${organization}`}>
          GitHub repositories that are owned by {organization}
        </A>
        . You can browse and work with them via <SiteName />.
        <br />
        <br />
        {error && <Alert type="error" message={error} showIcon />}
        {contents?.listing && <DirectoryListing listing={contents.listing} />}
      </Layout>
    </Customize>
  );
}
