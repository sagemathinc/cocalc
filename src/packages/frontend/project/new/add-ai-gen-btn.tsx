/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Flex } from "antd";

import { Ext } from "@cocalc/frontend/project/page/home-page/ai-generate-examples";
import { AIGenerateDocumentButton } from "../page/home-page/ai-generate-document";

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
      <Col sm={sm} md={md} key={`with-ai-${ext}`}>
        {btn}
        <AIGenerateDocumentButton mode="full" ext={ext} filename={filename} />
      </Col>
    );
  }
}
