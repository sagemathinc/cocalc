/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Avatar, Flex, Layout, List } from "antd";
import { ReactNode, isValidElement, useMemo } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import Image, { StaticImageData } from "components/landing/image";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import useCustomize, { CustomizeType } from "lib/use-customize";

export interface Item {
  link: string | ((customize: CustomizeType) => string | undefined);
  linkText?: ReactNode;
  title: ReactNode;
  logo: IconName | StaticImageData;
  logoBackground?: string; // #color
  image?: StaticImageData;
  imageWidth?: string;
  description: ReactNode | ((customize: CustomizeType) => ReactNode);
  shareServer?: boolean; // only show if the share server is enabled
  landingPages?: boolean; // only show if landing pages are enabled.
  hide?: (customize: CustomizeType) => boolean; // if returns true, then this item will be hidden.
}

export type DataSource = Item[];

// replaces the description attribute by {description: ReactNode}
type ItemProcessed = Omit<Item, "description" | "link"> & {
  description: ReactNode;
  link: string;
};

interface Props {
  title: ReactNode;
  description: ReactNode;
  dataSource: Item[];
  updated?: string;
  filter?: (item) => boolean;
}

export default function IndexList({ title, description, dataSource }: Props) {
  const customize = useCustomize();
  const { shareServer, landingPages } = customize;
  const filteredDataSource: ItemProcessed[] = useMemo(() => {
    return dataSource
      .filter((item) => {
        if (item.shareServer && !shareServer) return false;
        if (item.landingPages && !landingPages) return false;
        if (item.hide?.(customize)) return false;
        return true;
      })
      .map((item) => {
        return {
          ...item,
          description:
            typeof item.description === "function"
              ? item.description(customize)
              : item.description,
          link:
            typeof item.link === "function"
              ? item.link(customize) ?? ""
              : item.link,
        };
      });
  }, [shareServer, landingPages, dataSource]);
  return (
    <Layout.Content
      style={{
        backgroundColor: "white",
      }}
    >
      <Paragraph
        style={{
          maxWidth: MAX_WIDTH,
          margin: "15px auto",
          padding: "15px",
          backgroundColor: "white",
        }}
      >
        <Title
          level={1}
          style={{
            textAlign: "center",
            fontSize: "32pt",
            color: COLORS.GRAY_D,
          }}
        >
          {title}
        </Title>
        <Paragraph style={{ fontSize: "13pt" }}>{description}</Paragraph>
        <DataList dataSource={filteredDataSource} />
      </Paragraph>
    </Layout.Content>
  );
}

function DataList({ dataSource }: { dataSource: ItemProcessed[] }) {
  function renderItem(item: ItemProcessed): ReactNode {
    const icon = (
      <div>
        {isValidElement(item.logo) ? (
          item.logo
        ) : typeof item.logo === "string" ? (
          <Icon name={item.logo} style={{ fontSize: "75px" }} />
        ) : (
          <Image src={item.logo} width={75} height={75} alt="Logo" />
        )}
      </div>
    );

    const extra = item.image ? (
      <div
        className="cc-hidden-mobile"
        style={{ width: item.imageWidth ?? "275px" }}
      >
        <A href={item.link}>
          <Image
            src={item.image}
            alt={`Screenshot illustrating ${item.title}`}
          />
        </A>
      </div>
    ) : undefined;

    return (
      <List.Item key={item.link} extra={extra} style={{ marginTop: "16px" }}>
        <List.Item.Meta
          avatar={
            item.logo ? (
              <A href={item.link} alt={item.title + " logo "}>
                <Avatar
                  style={{
                    backgroundColor: item.logoBackground,
                  }}
                  alt={item.title + " logo "}
                  size={80}
                  shape="square"
                  icon={icon}
                />
              </A>
            ) : undefined
          }
          title={
            item.link ? (
              item.linkText ? (
                <Flex vertical>
                  <div style={{ fontSize: "16pt" }}>{item.title}</div>
                  <A href={item.link}>{item.linkText}</A>
                </Flex>
              ) : (
                <A href={item.link} style={{ fontSize: "16pt" }}>
                  {item.title}
                </A>
              )
            ) : (
              item.title
            )
          }
          description={
            <Paragraph style={{ color: COLORS.GRAY, fontSize: "12pt" }}>
              {item.description}
            </Paragraph>
          }
        />
      </List.Item>
    );
  }

  return (
    <List
      itemLayout="vertical"
      size="large"
      dataSource={dataSource}
      renderItem={renderItem}
    />
  );
}
