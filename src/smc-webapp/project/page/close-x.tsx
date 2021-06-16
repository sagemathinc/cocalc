import * as React from "react";
import useHover from "@react-hook/hover";
import { Icon } from "smc-webapp/r_misc";

interface CloseProps {
  clearGhostFileTabs?: () => void;
  closeFile: () => void;
}

const STYLE: React.CSSProperties = {
  fontSize: "10px",
  marginRight: "2.5px",
};

const STYLE_HOVERED: React.CSSProperties = {
  marginTop: "-5px",
};

const CloseX: React.FC<CloseProps> = ({ clearGhostFileTabs, closeFile }) => {
  const target = React.useRef(null);
  // Important: with enterDay:0, I was still hitting this sticky state bug
  // https://github.com/sagemathinc/cocalc/issues/5382
  // but with 50 I never do.  So maybe it works around a subtle issue, caused
  // by changing the style internally in response to hover state changing (?).
  const isHovering = useHover(target, { enterDelay: 50, leaveDelay: 100 });
  React.useEffect(() => {
    if (!isHovering) {
      clearGhostFileTabs?.();
    }
  }, [isHovering]);

  return (
    <div ref={target} style={{ float: "right" }}>
      <div style={isHovering ? STYLE_HOVERED : STYLE}>
        <Icon
          name={isHovering ? "close-circle-two-tone" : "times"}
          onClick={(e) => {
            e?.stopPropagation();
            e?.preventDefault();
            closeFile();
          }}
        />
      </div>
    </div>
  );
};

export default CloseX;
