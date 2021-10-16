import { trunc } from "lib/share/util";
import Loading from "components/share/loading";
import { Customize } from "lib/share/customize";
import PublicPaths from "components/share/public-paths";
import { Layout } from "components/share/layout";
import Avatar from "components/account/avatar";

interface Props {
  first_name: string;
  last_name: string;
  publicPaths;
  customize;
  account_id: string;
}

export default function Account({
  first_name,
  last_name,
  publicPaths,
  customize,
  account_id,
}: Props) {
  if (first_name == null || last_name == null || publicPaths == null) {
    return <Loading />;
  }
  const name = trunc(`${first_name} ${last_name}`, 150);
  return (
    <Customize value={customize}>
      <Layout title={name}>
        <h1>
          <Avatar account_id={account_id} size={64} style={{float:'right'}} /> {name}
        </h1>
        {name} is a collaborator on projects that contain the following public
        documents:
        <br />
        <br />
        <PublicPaths publicPaths={publicPaths} />
      </Layout>
    </Customize>
  );
}
