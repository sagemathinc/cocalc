/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Checkbox,
  Col,
  Divider,
  List,
  Radio,
  Row,
  Space,
  Upload,
} from "antd";
import { useEffect, useState } from "react";
import { InboxOutlined } from "@ant-design/icons";
import ImgCrop from "antd-img-crop";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import gravatarUrl from "@cocalc/frontend/account/gravatar-url";
import { ColorPicker } from "@cocalc/frontend/colorpicker";
import { Icon } from "@cocalc/frontend/components/icon";
import register from "../register";
import imageToDataURL from "@cocalc/frontend/misc/image-to-data";
import useEditTable from "lib/hooks/edit-table";
import useProfile from "lib/hooks/profile";
import useCustomize from "lib/use-customize";
import { DisplayAvatar } from "components/account/avatar";
import Code from "components/landing/code";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";

interface Data {
  email_address?: string;
  profile: {
    color?: string;
    image?: string;
  };
}

const desc = {
  color: `Select a color, which will be used for your cursor and background of
your name when editing documents with other people. Your color is also
used for the background of your avatar in case you do not select an
image below.`,
  image: `You can use an image for your avatar, instead of using the
first letter of your first name and the color above.`,
};

register({
  path: "account/avatar",
  title: "Avatar",
  icon: "user",
  desc: "Configure your avatar's cursor color and profile image.",
  search: desc,
  Component: () => {
    const { account } = useCustomize();
    const profile = useProfile({ account_id: account?.account_id });
    const { edited, original, setEdited, Save } = useEditTable<Data>({
      accounts: { profile: null, email_address: null },
    });
    const [useImage, setUseImage] = useState<undefined | boolean>(undefined);

    useEffect(() => {
      if (useImage == null && original != null) {
        setUseImage(!!original.profile.image);
      }
    }, [original]);

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical">
        <Row gutter={[20, 30]}>
          <Col md={24} sm={24}>
            <Save />
          </Col>
          <Col md={6} sm={24}>
            <Title level={3}>
              <Icon name="solution" /> Preview
            </Title>
            <List>
              <Paragraph type="secondary">Name</Paragraph>
              {profile && (
                <span
                  style={{
                    fontSize: "12pt",
                    backgroundColor: edited.profile.color,
                    color: avatar_fontcolor(edited.profile.color),
                    padding: "0 5px",
                  }}
                >
                  {profile?.first_name} {profile?.last_name}
                </span>
              )}
              <Divider plain />
              <Paragraph type="secondary">Small</Paragraph>
              <DisplayAvatar
                style={{ marginRight: "10px" }}
                size={40}
                color={edited.profile.color}
                image={edited.profile.image}
                letter={profile?.first_name?.[0]}
              />
              <Divider plain />
              <Paragraph type="secondary">Large</Paragraph>
              <DisplayAvatar
                size={120}
                color={edited.profile.color}
                image={edited.profile.image}
                letter={profile?.first_name?.[0]}
              />
              <Paragraph
                type="secondary"
                style={{ fontSize: "10px", marginTop: "20px" }}
              >
                (It will take a while for your avatar to update at the top of
                the page, even after you save it.)
              </Paragraph>
            </List>
          </Col>
          <Col md={18} sm={24}>
            <Title level={3}>
              <Icon name="colors" /> Color
            </Title>
            <Space direction="vertical" size="middle">
              <Paragraph>
                {desc.color}{" "}
                <A href="/config/account/name">Change your name.</A>
              </Paragraph>
              <div style={{ margin: "20px 0" }}>
                <ColorPicker
                  color={edited.profile.color}
                  style={{ width: "100%" }}
                  onChange={(color) => setEdited(color, "profile.color")}
                />
              </div>
              <Title level={3}>
                <Icon name="image" /> Image
              </Title>
              {desc.image}
              <Checkbox
                checked={useImage}
                onChange={(e) => {
                  setUseImage(e.target.checked);
                  if (!e.target.checked) {
                    setEdited("", "profile.image");
                  }
                }}
              >
                Use an Image
              </Checkbox>
              {useImage && (
                <EditImage
                  email_address={original.email_address}
                  value={
                    original.email_address &&
                    edited.profile.image?.includes("gravatar")
                      ? "gravatar"
                      : "image"
                  }
                  onChange={(image) => {
                    setEdited(image, "profile.image");
                  }}
                />
              )}
            </Space>
          </Col>
        </Row>
      </Space>
    );
  },
});

// This is what facebook uses, and it makes
// 40x40 look very good.  It takes about 20KB
// per image.
const AVATAR_SIZE: number = 160;

function EditImage({ value, email_address, onChange }) {
  return (
    <div style={{ marginLeft: "30px" }}>
      <Radio.Group
        style={{ marginBottom: "20px" }}
        value={value}
        onChange={(e) => {
          if (e.target.value == "gravatar") {
            onChange(gravatarUrl(email_address));
          } else {
            onChange("");
          }
        }}
      >
        <Space direction="vertical">
          <Radio value={"gravatar"} disabled={!email_address}>
            Use the Gravatar associated to <Code>{email_address}</Code>
          </Radio>
          <Radio value={"image"}>Upload an Image</Radio>
        </Space>
      </Radio.Group>
      {value == "gravatar" && (
        <Alert
          type="info"
          style={{ maxWidth: "500px" }}
          message={
            <Paragraph>
              Gravatar is a service for using a common avatar across websites.
              Go to the{" "}
              <A href="https://gravatar.com">Wordpress Gravatar site</A> and
              sign in (or create an account) using <Code>{email_address}</Code>.
            </Paragraph>
          }
        />
      )}
      {value == "image" && (
        <ImgCrop
          modalTitle={"Edit Profile Image"}
          cropShape="rect"
          rotationSlider
          maxZoom={5}
          onModalOk={(file) => {
            const reader = new FileReader();
            reader.addEventListener(
              "load",
              async (e) => {
                if (!e.target?.result) return; // typescript
                const src = e.target.result as string;
                onChange(
                  await imageToDataURL(
                    src,
                    AVATAR_SIZE,
                    AVATAR_SIZE,
                    "image/png"
                  )
                );
              },
              false
            );
            if (typeof file != "object") {
              // This is for typescript.
              // latest version of antd-img-crop has file having
              // some other potential types, but reader.readAsDataURL
              // doesn't allow some of those types.
              console.warn(
                "WARNING: unable to read, since avatar is assumed to be a Blob"
              );
              return;
            }
            reader.readAsDataURL(file as any);
          }}
        >
          <Upload.Dragger name="file">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Click or drag image to this area to upload
            </p>
          </Upload.Dragger>
        </ImgCrop>
      )}
    </div>
  );
}
