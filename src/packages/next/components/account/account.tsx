import { trunc } from "lib/share/util";
import Loading from "components/share/loading";
import { Customize } from "lib/share/customize";
import PublicPaths from "components/share/public-paths";
import { Layout } from "components/share/layout";

export default function Account({
  firstName,
  lastName,
  publicPaths,
  customize,
}) {
  if (firstName == null || lastName == null || publicPaths == null) {
    return <Loading />;
  }
  const name = trunc(`${firstName} ${lastName}`, 150);
  return (
    <Customize value={customize}>
      <Layout title={name}>
        <h1>{name}</h1>
        {name} is a collaborator on projects that contain the following public
        documents:
        <br />
        <br />
        <PublicPaths publicPaths={publicPaths} />
      </Layout>
    </Customize>
  );
}
