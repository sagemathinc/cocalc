/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { Paragraph, Title } from "components/misc";
import PaygInfo from "./payg-info";

export default function Boost({}) {
  return (
    <>
      <Title level={3}>
        <Icon name={"rocket"} style={{ marginRight: "5px" }} /> Buy a License
        Booster (Deprecated)
      </Title>
      <Space direction="vertical" style={{ marginBottom: "20px" }}>
        <Paragraph>
          <b>LICENSE BOOSTS ARE DEPRECATED.</b> Instead, consider a compute
          server or pay as you go project upgrade.
        </Paragraph>
        <Paragraph>
          <PaygInfo what={"a boost license"} />
        </Paragraph>
      </Space>
    </>
  );
}
