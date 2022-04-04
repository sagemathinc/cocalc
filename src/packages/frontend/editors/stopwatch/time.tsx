import { Icon } from "@cocalc/frontend/components/icon";
import { CSSProperties } from "react";

function zpad(n: number): string {
  let s = `${n}`;
  if (s.length === 1) {
    s = `0${s}`;
  }
  return s;
}

interface TimeProps {
  amount: number;
  compact?: boolean;
  style?: CSSProperties;
  showIcon?: boolean;
  countdown?: number;
}

export function TimeAmount(props: TimeProps) {
  let t = Math.round(props.amount / 1000);
  const hours = Math.floor(t / 3600);
  t -= 3600 * hours;
  const minutes = Math.floor(t / 60);
  t -= 60 * minutes;
  const seconds = t;
  return (
    <span
      style={{
        fontSize: !props.compact ? "50pt" : undefined,
        fontFamily: "courier",
        ...props.style,
      }}
    >
      {props.showIcon && (
        <TimerIcon countdown={props.countdown} style={{ marginRight: "5px" }} />
      )}
      {zpad(hours)}:{zpad(minutes)}:{zpad(seconds)}
    </span>
  );
}

export function TimerIcon({
  countdown,
  style,
}: {
  countdown?: number;
  style?: CSSProperties;
}) {
  return (
    <Icon name={countdown ? "hourglass-half" : "stopwatch"} style={style} />
  );
}
