import { useEffect, useState } from "react";
import register from "../register";
import { Alert, Checkbox, Col, Row, Radio, Space, Upload } from "antd";
import Loading from "components/share/loading";
import useEditTable from "lib/hooks/edit-table";
import { ColorPicker } from "@cocalc/frontend/colorpicker";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import { DisplayAvatar } from "components/account/avatar";
import useProfile from "lib/hooks/profile";
import useCustomize from "lib/use-customize";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import gravatarUrl from "@cocalc/frontend/account/gravatar-url";
import ImgCrop from "antd-img-crop";
import { InboxOutlined } from "@ant-design/icons";
import Code from "components/landing/code";

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
        <Save />
        <Row>
          <Col md={6} sm={24}>
            <div style={{ marginRight: "15px" }}>
              <h3 style={{ marginTop: "10px" }}>
                <DisplayAvatar
                  style={{ marginRight: "10px" }}
                  size={40}
                  color={edited.profile.color}
                  image={edited.profile.image}
                  letter={profile?.first_name?.[0]}
                />
                Preview
              </h3>
              <br />
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
              <br />
              <br />
              <DisplayAvatar
                size={120}
                color={edited.profile.color}
                image={edited.profile.image}
                letter={profile?.first_name?.[0]}
              />
              <br />
              <br />
              <div style={{ fontSize: "10px", color: "#666" }}>
                (It will take a while for your avatar to update at the top of
                the page, even after you save it.)
              </div>
            </div>
          </Col>
          <Col md={18} sm={24}>
            <Space direction="vertical">
              <h3>
                <Icon name="colors" /> Color
              </h3>
              <div>
                {desc.color}{" "}
                <A href="/config/account/name">Change your name.</A>
              </div>
              <div style={{ width: "100%" }}>
                <ColorPicker
                  color={edited.profile.color}
                  style={{ width: "200px", margin: "auto" }}
                  onChange={(color) => setEdited(color, "profile.color")}
                />
              </div>
              <h3>
                <Icon name="image" /> Image
              </h3>
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
            <>
              Gravatar is a service for using a common avatar across websites.
              Go to the{" "}
              <A href="https://gravatar.com">Wordpress Gravatar site</A> and
              sign in (or create an account) using <Code>{email_address}</Code>.
            </>
          }
        />
      )}
      {value == "image" && (
        <ImgCrop
          modalTitle={"Edit Profile Image"}
          shape="round"
          rotate
          maxZoom={5}
          onModalOk={(file) => {
            const reader = new FileReader();
            reader.addEventListener(
              "load",
              (e) => {
                if (!e.target?.result) return; // typescript
                const img = new Image();
                img.src = e.target.result as string;
                img.onload = () => {
                  img.width = AVATAR_SIZE;
                  img.height = AVATAR_SIZE;
                  const canvas = document.createElement("canvas");
                  const ctx = canvas.getContext("2d");
                  if (ctx == null) {
                    return;
                  }
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  canvas.width = img.width;
                  canvas.height = img.height;
                  ctx.drawImage(img, 0, 0, img.width, img.height);
                  onChange(canvas.toDataURL("image/png"));
                };
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
            reader.readAsDataURL(file);
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
