import { getScript } from "pages/api/v2/compute/startup-script";

// not used but required by nextjs
export default function OnPrem() {
  return null;
}

export async function getServerSideProps(context) {
  const { res } = context;
  const { id: id0, api_key } = context.params;
  res.setHeader("Content-Type", "text/plain");
  try {
    const id = parseInt(id0);
    if (!api_key) {
      throw Error("invalid api key");
    }
    res.write(await getScript({ api_key, id }));
  } catch (err) {
    res.write(`echo 'ERROR -- ${err}'; exit 1`);
  }
  res.end();
  return { props: {} };
}
