/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Avatar, Layout, List } from "antd";
import { ReactNode, useMemo } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { Paragraph, Title } from "components/misc";
import Image, { StaticImageData } from "components/landing/image";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import useCustomize from "lib/use-customize";

export interface Item {
  link: string;
  title: ReactNode;
  logo: IconName | StaticImageData;
  logoBackground?: string; // #color
  image?: StaticImageData;
  imageWidth?: string;
  description: ReactNode;
  shareServer?: boolean; // only show if the share server is enabled
  landingPages?: boolean; // only show if landing pages are enabled.
  hide?: (CustomizeType) => boolean; // if returns true, then this item will be hidden.
}

export type DataSource = Item[];

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
  const filtedDataSource = useMemo(() => {
    return dataSource.filter((item) => {
      if (item.shareServer && !shareServer) return false;
      if (item.landingPages && !landingPages) return false;
      if (item.hide?.(customize)) return false;
      return true;
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
          style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}
        >
          {title}
        </Title>
        <Paragraph style={{ fontSize: "13pt" }}>{description}</Paragraph>
        <DataList dataSource={filtedDataSource} />
      </Paragraph>
    </Layout.Content>
  );
}

function DataList({ dataSource }: { dataSource: Item[] }) {
  function renderItem(item): ReactNode {
    const icon = (
      <div style={{ marginTop: "2.5px" }}>
        {typeof item.logo === "string" ? (
          <Icon name={item.logo} style={{ fontSize: "75px" }} />
        ) : (
          <Image src={item.logo} width={75} height={75} alt="Logo" />
        )}
      </div>
    );
    const extra = item.image && (
      <div
        className="hidden-mobile"
        style={{ width: item.imageWidth ?? "275px" }}
      >
        <A href={item.link}>
          <Image
            src={item.image}
            alt={`Screenshot illustrating ${item.title}`}
          />
        </A>
      </div>
    );
    return (
      <List.Item key={item.link} extra={extra}>
        <List.Item.Meta
          avatar={
            item.logo && (
              <A href={item.link} alt={item.title + " logo "}>
                <Avatar
                  style={{
                    marginTop: "20px",
                    backgroundColor: item.logoBackground,
                  }}
                  alt={item.title + " logo "}
                  size={80}
                  shape="square"
                  icon={icon}
                />
              </A>
            )
          }
          title={
            <A href={item.link} style={{ fontSize: "16pt" }}>
              {item.title}
            </A>
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
