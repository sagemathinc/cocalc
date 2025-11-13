import { CSS } from "@cocalc/frontend/app-framework";

// The base64 encoded png is exactly the Mistral AI from their website, with transparent background.
// Why? Importing it from a file and including it causes a nextjs error.

export default function MistralAvatar({
  size = 64,
  style,
  backgroundColor = "transparent",
}: {
  size: number;
  style?: CSS;
  backgroundColor?: string;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "inline-block",
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          backgroundColor,
          color: "white",
          height: size,
          top: "1px",
        }}
      >
        <img
          alt="Mistral AI Icon"
          width={size}
          height={size}
          src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAEB0lEQVR4nOzdP4tc9RfH8XN35/djkzRK4h9WjZVgJRKwsLDTJlZCJDZ5DJYiCqa0tPQhBCJ2Smp7OzutlrCFRlxQN0uY3WsRS/kQznf0zsLrBVue/c7MvW/mVmdW8zwX8M92ln4BsM0EAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCASCVXdwmqb2Qq35++7koOc+e7peuH200OnnxjRNN6rqbmf2zud1ePOd2t/8q3oC1+Zp0//SNwgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBIJpnns7qIeWV3/dnRz0Z92ruc7+83Nvze92R6dp+qYz99TFOv3ty9rtzB78Ws//cL+udWZfe6UevPhsXenMDntv88ur29vdh/yxyKlVc71d00Lvue96c27dvb5XLz/+a5nr0WLX91/gEQsCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAsHIIud1e/LngVNHzLWuje//fgL3bn/UHf3kjd7nvPf/Wi/0Oc9D98aWWebnDz7sTg56HMh52+7e1d7uPuiwqvYXOLfqi83//IFHLAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBCPLjY/bkw8X6nLv7KCqt9/94Pd6qXvs1dUi7/e0LpwddgaP13XhwcO60pm9vDOdXdqZ+vfGlhkJ5GJ78v7ewLEDPvj4zbr16VFn9OWRbfbXF3i/83xS3x6/2hm9NE03qupuZ/bO6/87urm/6t8bW8YjFgQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEgpHl1b+0J78bOXbAW73N7n97vz05t/de9811OjC9272+qx931/XTqn9vbJmRO/WZ9uSjkft0wMmqv6F9nr/a7IvZaqfd67s+mQ5rd+rfG1vGIxYEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBIJpXmLzOJwTvkEgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEfwUAAP//joB2YP8SrLUAAAAASUVORK5CYII="
        ></img>
      </div>
    </div>
  );
}
