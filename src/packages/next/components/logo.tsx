/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { isEmpty } from "lodash";

import { unreachable } from "@cocalc/util/misc";
import Image from "components/landing/image";
import useCustomize from "lib/use-customize";
import fullLogo from "public/logo/full.svg";
import icon from "public/logo/icon.svg";
import rectangular from "public/logo/rectangular.svg";
import { CSS } from "./misc";

interface Props {
  type: "rectangular" | "icon" | "full";
  style?: React.CSSProperties;
  width?: number; // px
  priority?: boolean;
}

export default function Logo(props: Props) {
  const { priority, type } = props;
  const { logoRectangularURL, logoSquareURL, siteName } = useCustomize();

  function config(): { alt: string; src: string; custom: boolean } {
    switch (type) {
      case "rectangular":
        return {
          alt: `Rectangular ${siteName} Logo`,
          src: logoRectangularURL ? logoRectangularURL : rectangular,
          custom: !!logoRectangularURL,
        };
      case "icon":
        return {
          alt: "CoCalc Logo Icon",
          src: logoSquareURL ? logoSquareURL : icon,
          custom: !!logoSquareURL,
        };
      case "full":
        return {
          alt: `${siteName} Logo`,
          src: fullLogo,
          custom: false,
        };
      default:
        unreachable(type);
        return { alt: "Logo", src: icon, custom: false };
    }
  }

  const { alt, src, custom } = config();

  const style: CSS = {
    ...(isEmpty(props.style) && { maxWidth: "100%" }),
    ...props.style,
  };

  if (props.width) {
    style.width = `${props.width}px`;
    style.maxWidth = `${props.width}px`;
  }

  if (type === "full" && logoSquareURL && logoRectangularURL) {
    // we "fake" a full logo it by stacking the square logo on top of the rectangular one in a div
    return (
      <div
        style={{
          ...props.style,
          textAlign: "center",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <Image
          alt={alt}
          src={logoSquareURL}
          style={{
            width: "50%",
          }}
        />
        <div>
          <Image
            src={logoRectangularURL}
            alt={alt}
            style={{ width: "100%", marginTop: "1rem" }}
          />
        </div>
      </div>
    );
  } else if (custom) {
    return <Image alt={alt} src={src} style={style} />;
  } else {
    return <Image alt={alt} src={src} style={style} priority={priority} />;
  }
}
