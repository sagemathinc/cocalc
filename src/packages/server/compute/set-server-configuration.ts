/*
Set a compute server's configuration.

This can ONLY be changed then the compute_server is in the off state,
and it can ONLY be changed the owner of the compute_server.

However, we do NOT check that the configuration is valid.  The frontend
may attempt to ensure that, but it's fully this backends responsibility
when starting the server to return an error if the configuration is not
valid.  Basically, storing a valid configuraiton in an OFF compute server
is allowed.

This also shallow merges in configuration via postgresql COALESCE, so if you set
the configuration to {zone:'foo'} that doesn't delete the rest of the configuration.
*/

import getPool from "@cocalc/database/pool";
import {
  makeConfigurationChange,
  validateConfigurationChange,
} from "./control";
import type { Configuration } from "@cocalc/util/db-schema/compute-servers";
import { getServer } from "./get-servers";
import updatePurchase from "./update-purchase";
import { isDnsAvailable } from "./dns";
import { setConfiguration } from "./util";
import {
  validatedHealthCheck,
  validatedSpendLimit,
  validatedShutdownTime,
} from "@cocalc/util/db-schema/compute-servers";

export default async function setServerConfiguration({
  account_id,
  id,
  configuration, // the partial of configuration changes
}: {
  account_id: string;
  id: number;
  configuration: Partial<Configuration>;
}) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT state, cloud, configuration FROM compute_servers WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rows.length == 0) {
    throw Error(
      "invalid id or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }

  const { cloud, state, configuration: currentConfiguration } = rows[0];

  if (configuration.dns && currentConfiguration.dns != configuration.dns) {
    // dns is NOT case sensitive, so just in case, we make sure.
    configuration.dns = configuration.dns.toLowerCase();
    // changing dns to be nontrivial, so need to check it doesn't equal any *other* dns
    // We just do linear scan through db for now.
    if (!(await isDnsAvailable(configuration.dns))) {
      throw Error(
        `Subdomain '${configuration.dns}' is not available.    Please change 'DNS: Custom Subdomain' and select a different subdomain.`,
      );
    }
  }
  if (configuration.spendLimit != null) {
    // ensure the spendLimit is formatted in a valid way
    configuration = {
      ...configuration,
      spendLimit: validatedSpendLimit(configuration.spendLimit),
    };
  }

  if (configuration.healthCheck != null) {
    // ensure the healthCheck is formatted in a valid way
    configuration = {
      ...configuration,
      healthCheck: validatedHealthCheck(configuration.healthCheck),
    };
  }

  if (configuration.shutdownTime != null) {
    // ensure the shutdownTime is formatted in a valid way
    configuration = {
      ...configuration,
      shutdownTime: validatedShutdownTime(configuration.shutdownTime),
    };
  }

  await validateConfigurationChange({
    cloud,
    state,
    currentConfiguration,
    changes: configuration,
  });

  if (state != "deprovisioned") {
    // A big worry would be if the user could somehow trick the system into
    // making config changes to the provisioned VM, but this still throws an
    // exception, so they can get something for free.  However, we will also
    // sync the provisioned state back to our database regularly, thus updating
    // the configuration.  Still, it is something to worry about.  ALSO,
    // we can always ALSO check that the configuration is correct when starting
    // the machine, just in case.
    await makeConfigurationChange({
      id,
      cloud,
      state,
      currentConfiguration,
      changes: configuration,
    });
    const provisioned_configuration = {
      ...currentConfiguration,
      ...configuration,
    };
    await pool.query(
      "UPDATE compute_servers SET provisioned_configuration = $1::jsonb WHERE id=$2",
      [provisioned_configuration, id],
    );
    const server = await getServer({ id, account_id });
    // Note: It's conceivable something goes wrong and the configuration changes, e.g., the disk
    // is enlarged, and somehow we don't get to this point right here and update the cost.
    // This still gets handled, but later via a maintenane process, so only a small amount of
    // money is lost.
    await updatePurchase({ server, newState: state });
  }

  await setConfiguration(id, configuration);
}
