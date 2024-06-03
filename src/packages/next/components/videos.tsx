import { Carousel } from "antd";
import { useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { Paragraph } from "components/misc";
import A from "components/misc/A";

export interface Video {
  id: string;
  title: string;
}

export default function Videos({ videos }: { videos: Readonly<Video[]> }) {
  const [current, setCurrent] = useState<number>(0);
  let n = -1;
  return (
    <div style={{ margin: "0 auto", textAlign: "center" }}>
      <Paragraph>
        <Carousel afterChange={setCurrent}>
          {videos.map(({ id, title }) => {
            n += 1;
            return (
              <VideoItem
                key={id}
                id={id}
                number={n}
                current={current}
                title={title}
              />
            );
          })}
        </Carousel>
      </Paragraph>
    </div>
  );
}

function VideoItem({
  id,
  title,
  number,
  current,
}: {
  id: string;
  title: string;
  number: number;
  current: number;
}) {
  return (
    <div>
      <div
        style={{
          background: "black",
          paddingBottom: "30px",
          paddingTop: "5px",
        }}
      >
        <A style={{ color: "white" }} href={`https://youtu.be/${id}`}>
          <Icon name="youtube" style={{ color: "red" }} /> {title}
        </A>
        <iframe
          style={{ marginTop: "30px", maxWidth: "100%" }}
          width="672"
          height="378"
          src={`https://www.youtube.com/embed/${current == number ? id : ""}`}
          title="YouTube video player"
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
        <A
          style={{ color: "white", float: "right", marginRight: "10px" }}
          href="https://www.youtube.com/playlist?list=PLOEk1mo1p5tJmEuAlou4JIWZFH7IVE2PZ"
        >
          <Icon name="youtube" style={{ color: "red" }} /> More Videos
        </A>
      </div>
    </div>
  );
}
