// Upload an image that is associated to the project.

import { useState } from "react";
import { useIntl } from "react-intl";
import { Alert, Upload } from "antd";
import ImgCrop from "antd-img-crop";
import { InboxOutlined } from "@ant-design/icons";
import imageToDataURL from "@cocalc/frontend/misc/image-to-data";
import { labels } from "@cocalc/frontend/i18n";

// aiming for about 200kB
const fullSize: number = 320;
// aiming for about 3kB
const tinySize: number = 32;

interface Props {
  avatarImage?: string;
  onChange: (data: {
    full: string; // full size image
    tiny: string; // tiny image
  }) => void;
}

export default function ProjectImage({ avatarImage, onChange }: Props) {
  const [error, setError] = useState<string>("");
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();
  return (
    <div>
      <ImgCrop
        modalTitle={`Edit ${projectLabel} Image`}
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
              try {
                const data = {
                  full: await imageToDataURL(
                    src,
                    fullSize,
                    fullSize,
                    "image/png",
                  ),
                  tiny: await imageToDataURL(
                    src,
                    tinySize,
                    tinySize,
                    "image/png",
                  ),
                };
                onChange(data);
              } catch (err) {
                setError(`Error processing uploaded image -- ${err}`);
              }
            },
            false,
          );
          if (typeof file != "object") {
            // see comment in src/packages/next/components/account/config/account/avatar.tsx
            console.warn(
              "WARNING: unable to read, since image is assumed to be a Blob",
            );
            return;
          }
          reader.readAsDataURL(file as any); // typing situation is weird, but this does work right now.
        }}
      >
        <Upload.Dragger
          name="file"
          showUploadList={false}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {avatarImage ? (
            <img src={avatarImage} width="160px" height="160px" />
          ) : (
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
          )}
          <p className="ant-upload-text">
            Click or drag {projectLabelLower} image
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
