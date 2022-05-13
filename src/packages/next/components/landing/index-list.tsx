import { ReactNode, useMemo } from "react";
import { List, Avatar } from "antd";
import Image, { StaticImageData } from "components/landing/image";
import A from "components/misc/A";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { Layout } from "antd";
import useCustomize, { CustomizeType } from "lib/use-customize";
import { MAX_WIDTH } from "lib/config";

export interface Item {
  link: string;
  title: ReactNode;
  logo: IconName | StaticImageData;
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
      <div
        style={{
          maxWidth: MAX_WIDTH,
          margin: "15px auto",
          padding: "15px",
          backgroundColor: "white",
        }}
      >
        <h1 style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}>
          {title}
        </h1>
        <p>{description}</p>
        <DataList dataSource={filtedDataSource} />
      </div>
    </Layout.Content>
  );
}

function DataList({ dataSource }: { dataSource: Item[] }) {
  return (
    <List
      itemLayout="vertical"
      size="large"
      dataSource={dataSource}
      renderItem={(item) => {
        const icon = (
          <div style={{ marginTop: "2.5px" }}>
            {typeof item.logo == "string" ? (
              <Icon name={item.logo} style={{ fontSize: "75px" }} />
            ) : (
              <Image src={item.logo} width={75} height={75} alt="Logo" />
            )}
          </div>
        );
        const extra = item.image && (
          <div style={{ width: item.imageWidth ?? "275px" }}>
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
                      alt={item.title + " logo "}
                      size={80}
                      shape="square"
                      icon={icon}
                    />
                  </A>
                )
              }
              title={<A href={item.link}>{item.title}</A>}
              description={
                <span style={{ color: "#666" }}>{item.description}</span>
              }
            />
          </List.Item>
        );
      }}
    />
  );
}
