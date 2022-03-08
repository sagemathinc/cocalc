import Info from "./info";
import A from "components/misc/A";
import { StaticImageData } from "./image";

interface Props {
  image: StaticImageData;
}

export default function Collaboration({ image }: Props) {
  return (
    <Info
      anchor="a-realtimesync"
      icon="users"
      title="Collaborative editing without limits"
      image={image}
      alt="Editing a document in two browser windows"
    >
      <p>
        Privately share your project with{" "}
        <A href="https://doc.cocalc.com/project-settings.html#about-collaborators">
          <strong>an unlimited number of collaborators</strong>
        </A>
        . Simultaneous modifications of your document are{" "}
        <strong>synchronized in real time</strong>. You see the cursors of
        others while they edit the document and also see the presence of
        watching collaborators.
      </p>
      <p>
        Additionally, any compilation status and output is synchronized between
        everyone, because everything runs online and is fully managed by CoCalc.
      </p>
      <p>
        This ensures that everyone involved experiences editing the document in
        exactly the same way.
      </p>
    </Info>
  );
}
