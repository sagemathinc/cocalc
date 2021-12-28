interface Props {
  epoch: number; // ms since epoch
}

export default function Timestamp({ epoch }: Props) {
  return <>{epoch ? new Date(epoch).toLocaleString() : "-"}</>;
}
