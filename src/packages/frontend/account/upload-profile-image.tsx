// Upload user avatar image

// similar to code in next/components/account/config/account/avatar.tsx

import { useState } from "react";
import { Alert, Upload } from "antd";
import ImgCrop from "antd-img-crop";
import imageToDataURL from "@cocalc/frontend/misc/image-to-data";
import { Avatar } from "./avatar/avatar";

// This is what facebook uses, and it makes
// 40x40 look very good.  It takes about 20KB
// per image.

const AVATAR_SIZE: number = 160;

interface Props {
  account_id: string;
  onChange: (data) => void;
}

export default function UploadProfileImage({ account_id, onChange }: Props) {
  const [error, setError] = useState<string>("");
  return (
    <div>
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
                  "image/png",
                ),
              );
            },
            false,
          );
          if (typeof file != "object") {
            setError(
              "WARNING: unable to read, since avatar is assumed to be a Blob",
            );
            return;
          }
          reader.readAsDataURL(file as any);
        }}
      >
        <Upload.Dragger
          name="file"
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <p className="ant-upload-drag-icon">
            <Avatar account_id={account_id} size={AVATAR_SIZE/2} />
          </p>
          <p className="ant-upload-text">
            Click or drag image to this area to upload
          </p>
        </Upload.Dragger>
      </ImgCrop>
      {error && (
        <Alert
          style={{ marginTop: "15px" }}
          type="error"
          message={error}
          showIcon
        />
      )}
    </div>
  );
}
