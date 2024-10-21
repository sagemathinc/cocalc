/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Flex, Space } from "antd";

import { AIGenerateDocumentButton } from "@cocalc/frontend/project/page/home-page/ai-generate-document";
import { Ext } from "@cocalc/frontend/project/page/home-page/ai-generate-examples";

interface Props {
  btn: JSX.Element;
  grid: [number | { flex: string }, number | { flex: string }];
  filename: string | undefined;
  filenameChanged?: boolean;
  mode: "full" | "flyout";
  ext: Ext;
}

export function AiDocGenerateBtn({ btn, grid, ext, filename, mode }: Props) {
  const isFlyout = mode === "flyout";
  const [sm, md] = grid;

  if (isFlyout) {
    return (
      <Col sm={sm} md={md} key={`with-ai-${ext}`}>
        <Flex align="flex-start" vertical={false} gap={"5px"}>
          <Flex flex={"1 1 auto"}>{btn}</Flex>
          <Flex flex={"0 0 auto"}>
            <AIGenerateDocumentButton
              mode="flyout"
              ext={ext}
              filename={filename}
            />
          </Flex>
        </Flex>
      </Col>
    );
  } else {
    return (
      //<Space direction="vertical">
      <Flex
        align="flex-start"
        vertical={true}
        gap={"5px"}
        style={{ width: "100%" }}
      >
        <Flex flex={"1 1 auto"}>{btn}</Flex>
        <Flex flex={"0 0 auto"}>
          <AIGenerateDocumentButton mode="full" ext={ext} filename={filename} />
        </Flex>
      </Flex>
    );
  }
}
