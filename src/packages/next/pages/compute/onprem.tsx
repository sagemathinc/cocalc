import { get } from "../api/v2/compute/startup-script";
// not used
export default function OnPrem() {
  return null;
}

export async function getServerSideProps(context) {
  const { req, res } = context;
  res.setHeader("Content-Type", "text/plain");
  try {
    res.write(await get(req));
  } catch (err) {
    res.write(`echo 'ERROR -- ${err}'; exit 1`);
  }
  res.end();
  return { props: {} };
}
