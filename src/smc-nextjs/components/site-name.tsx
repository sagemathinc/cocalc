// TODO -- make it use the database or env variable once (?).

export default function SiteName({ full }: { full?: boolean }) {
  if (full) {
    return <>CoCalc: Collaborative Calculation in the Cloud</>;
  }
  return <>CoCalc</>;
}
