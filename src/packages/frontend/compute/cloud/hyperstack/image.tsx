import { Divider } from "antd";
import SelectImage, {
  ImageDescription,
  ImageLinks,
} from "@cocalc/frontend/compute/select-image";
import ExcludeFromSync from "@cocalc/frontend/compute/exclude-from-sync";
import Ephemeral from "@cocalc/frontend/compute/ephemeral";

export default function Image(props) {
  const { state = "deprovisioned" } = props;
  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <b>Image</b>
      </div>
      {(state == "deprovisioned" || state == "off") && (
        <div style={{ color: "#666", marginBottom: "5px" }}>
          Select compute server image. You will be able to use sudo with no
          password and can install anything into the Ubuntu 22.04 Linux image.
          Click "advanced" for more options, which may be less tested or take
          MUCH longer to start due to size.
        </div>
      )}
      <SelectImage {...props} gpu={true} arch={"x86_64"} maxDockerSizeGb={2} />
      <div style={{ color: "#666", marginTop: "5px" }}>
        <ImageDescription configuration={props.configuration} />
        <ImageLinks
          image={props.configuration.image}
          style={{ flexDirection: "row" }}
        />
        {!(state == "deprovisioned" || state == "off") && (
          <div style={{ color: "#666", marginTop: "5px" }}>
            You can only edit the image when server is deprovisioned or off.
          </div>
        )}
      </div>
      <ExcludeFromSync {...props} />
      <Divider />
      <Ephemeral style={{ marginTop: "30px" }} {...props} />
    </div>
  );
}
