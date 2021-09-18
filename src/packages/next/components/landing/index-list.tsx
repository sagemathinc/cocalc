import { ReactNode } from "react";
import { List, Avatar } from "antd";
import Image, { StaticImageData } from "components/landing/image";
import A from "components/misc/A";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { Layout } from "antd";

interface Item {
  link: string;
  title: ReactNode;
  logo: IconName | StaticImageData;
  image: StaticImageData;
  description: ReactNode;
}

export type DataSource = Item[];

interface Props {
  title: ReactNode;
  description: ReactNode;
  dataSource: Item[];
  updated?: string;
}

export default function IndexList({ title, description, dataSource }: Props) {
  return (
    <Layout.Content
      style={{
        backgroundColor: "white",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "15px auto",
          padding: "15px",
          backgroundColor: "white",
        }}
      >
        <h1 style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}>
          {title}
        </h1>
        <p>{description}</p>
        <DataList dataSource={dataSource} />
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
          <div style={{ width: "275px" }}>
            <A href={item.link}>
              <Image src={item.image} alt="Screenshot" />
            </A>
          </div>
        );
        return (
          <List.Item key={item.link} extra={extra}>
            <List.Item.Meta
              avatar={
                item.logo && (
                  <A href={item.link}>
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
