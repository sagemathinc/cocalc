import { Carousel } from "antd";
import { join } from "path";
import { useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import {
  grantYouTubeConsent,
  useYouTubeConsent,
} from "@cocalc/frontend/cookie-consent/youtube";
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

export function VideoItem({
  id,
  title,
  number = 0,
  current = 0,
  style,
  width = 672,
}: {
  id: string;
  title?: string;
  number?: number;
  current?: number;
  style?;
  width?: number;
}) {
  // Embedded YouTube videos are gated behind a dedicated consent cookie
  // (see frontend/cookie-consent/youtube.ts). Until the visitor clicks the
  // gate we render a proxied thumbnail and never contact Google. Once
  // allowed, we still use the youtube-nocookie domain — it defers cookie
  // setting until playback and is the documented "privacy-enhanced" embed.
  const ytAllowed = useYouTubeConsent();
  // True only when the user just dismissed the gate for THIS card. We use
  // it to autoplay the video they actually asked to watch — without
  // autoplaying every other embed on the page that becomes visible by
  // side-effect of the shared consent cookie.
  const [justAccepted, setJustAccepted] = useState(false);
  const isActive = current === number;
  const height = Math.round((width * 9) / 16);
  return (
    <div style={style}>
      <div
        style={{
          background: "black",
          paddingBottom: "30px",
          paddingTop: "5px",
        }}
      >
        {title && (
          <A style={{ color: "white" }} href={`https://youtu.be/${id}`}>
            <Icon name="youtube" style={{ color: "red" }} /> {title}
          </A>
        )}
        <div style={{ textAlign: "center" }}>
          {ytAllowed && isActive ? (
            <iframe
              style={{ marginTop: "30px", maxWidth: "100%" }}
              width={width}
              height={height}
              // autoplay=1 only when the user just clicked this gate, so we
              // don't surprise visitors with sibling carousel slides or
              // returning visitors with a previously-granted consent.
              src={`https://www.youtube-nocookie.com/embed/${id}${justAccepted ? "?autoplay=1" : ""}`}
              title="YouTube video player"
              frameBorder={0}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          ) : (
            <VideoGate
              id={id}
              width={width}
              height={height}
              title={title}
              onAccept={() => {
                setJustAccepted(true);
                grantYouTubeConsent();
              }}
            />
          )}
        </div>
        <A
          style={{ color: "white", float: "right", marginRight: "10px" }}
          href="https://www.youtube.com/@cocalc-cloud"
        >
          <Icon name="youtube" style={{ color: "red" }} /> More Videos
        </A>
      </div>
    </div>
  );
}

function VideoGate({
  id,
  width,
  height,
  title,
  onAccept,
}: {
  id: string;
  width: number;
  height: number;
  title?: string;
  onAccept: () => void;
}) {
  // Server-side thumbnail proxy — see pages/api/youtube-thumbnail/[id].ts.
  // appBasePath keeps this working on installations served under a
  // non-root prefix.
  const thumbUrl = join(
    appBasePath,
    "api/youtube-thumbnail",
    encodeURIComponent(id),
  );
  return (
    <button
      type="button"
      onClick={onAccept}
      aria-label={
        title ? `Load YouTube video: ${title}` : "Load YouTube video"
      }
      style={{
        position: "relative",
        marginTop: "30px",
        width,
        maxWidth: "100%",
        height,
        padding: 0,
        border: 0,
        cursor: "pointer",
        color: "white",
        background: `#000 url(${thumbUrl}) center / cover no-repeat`,
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "12px",
          textAlign: "center",
        }}
      >
        <Icon
          name="youtube"
          style={{ color: "red", fontSize: "48px" }}
        />
        <span style={{ fontWeight: 600, fontSize: "18px" }}>Play video</span>
        <span style={{ fontSize: "13px", maxWidth: "85%", lineHeight: 1.4 }}>
          Loading this video allows YouTube to set cookies in your browser.
          Click to accept and play.
        </span>
      </span>
    </button>
  );
}
