import { DNS_COST_PER_HOUR, checkValidDomain } from "@cocalc/util/compute/dns";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Flex, Input, Spin, Switch } from "antd";
import { A, Icon } from "@cocalc/frontend/components";
import { currency } from "@cocalc/util/misc";
import { debounce } from "lodash";
import { isDnsAvailable } from "@cocalc/frontend/compute/api";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import ShowError from "@cocalc/frontend/components/error";

async function checkDns(dns, setDnsError, setChecking) {
  try {
    checkValidDomain(dns);
  } catch (err) {
    setDnsError(`${err}.
                  Please enter a valid subdomain name. Subdomains can consist of
                  letters (a-z, A-Z), numbers (0-9), and hyphens (-). They
                  cannot start or end with a hyphen.`);
    return false;
  }
  try {
    setChecking(true);
    if (!(await isDnsAvailable(dns))) {
      setDnsError(
        `${dns} is not available -- in use by another compute server`,
      );
      return false;
    }
    setDnsError("");
    return true;
  } catch (err) {
    setDnsError(`${err}`);
  } finally {
    setChecking(false);
  }
}

export default function DNS({ setConfig, configuration, loading }) {
  const compute_servers_dns = useTypedRedux("customize", "compute_servers_dns");
  const [help, setHelp] = useState<boolean>(false);
  const [showDns, setShowDns] = useState<boolean>(!!configuration.dns);
  const [dnsError, setDnsError] = useState<string>("");
  const [dns, setDns] = useState<string | undefined>(configuration.dns);
  const [checking, setChecking] = useState<boolean>(false);
  const checkValid = useMemo(() => {
    const f = reuseInFlight(async (dns) => {
      await checkDns(dns, setDnsError, setChecking);
    });
    return debounce(f, 1000);
  }, [setDnsError]);

  useEffect(() => {
    if (dns) {
      checkValid(dns);
    }
  }, [dns]);

  if (!compute_servers_dns) {
    return null;
  }

  return (
    <div>
      <Flex style={{ alignItems: "center" }}>
        <Checkbox
          style={{ flex: 1 }}
          disabled={loading}
          checked={showDns}
          onChange={() => {
            setShowDns(!showDns);
            if (showDns) {
              // disable on backend.
              setConfig({ dns: "" });
            }
          }}
        >
          DNS: Custom Subdomain with SSL ({currency(DNS_COST_PER_HOUR)}/hour
          when running or stopped)
        </Checkbox>{" "}
        {showDns && (
          <Switch
            size="small"
            checkedChildren={"Help"}
            unCheckedChildren={"Help"}
            style={{ float: "right" }}
            checked={help}
            onChange={(val) => setHelp(val)}
          />
        )}
      </Flex>

      {showDns && (
        <div style={{ marginTop: "5px" }}>
          <Flex style={{ alignItems: "center" }}>
            <Input
              disabled={loading}
              style={{ margin: "15px 50px 15px 0", flex: 0.5 }}
              maxLength={63}
              showCount
              allowClear
              value={dns}
              onChange={(e) => {
                const dns = e.target.value.trim();
                setDns(dns);
                if (!dns) {
                  setConfig({ dns: "" });
                }
              }}
            />
            {showDns && (
              <A
                style={{ flex: 0.5 }}
                href={`https://${configuration.dns}.${compute_servers_dns}`}
              >
                <Icon name="external-link" /> https://{dns ?? "*"}.
                {compute_servers_dns}
              </A>
            )}
          </Flex>
          <Button
            disabled={
              configuration.dns == dns || dnsError || loading || checking
            }
            onClick={async () => {
              if (await checkDns(dns, setDnsError, setChecking)) {
                const s = (dns ?? "").toLowerCase();
                setConfig({ dns: s });
                setDns(s);
              }
            }}
          >
            {!dns || configuration.dns != dns
              ? "Enable Custom Domain"
              : "Custom Domain Enabled"}
            {checking && <Spin style={{ marginLeft: "15px" }} delay={500} />}
          </Button>
          {dns && dnsError && (
            <ShowError
              error={dnsError}
              setError={setDnsError}
              style={{ margin: "10px 0" }}
            />
          )}
          {help && (
            <Alert
              type="info"
              style={{ margin: "10px 0" }}
              showIcon
              message={"Custom DNS Subdomain"}
              description={
                <>
                  <p>
                    A custom DNS A record with{" "}
                    <A href="https://developers.cloudflare.com/dns/manage-dns-records/reference/proxied-dns-records/">
                      https and http proxying will be created at CloudFlare
                    </A>{" "}
                    as long as your VM is not deprovisioned. Whenever your VM
                    starts running it is allocated an external ip address, and
                    CoCalc updates the DNS entry to point at that ip address. An
                    https web server that you run on your compute server
                    listening on port 443 with a self-signed certificate will
                    appear to have a valid certificate to browsers visiting the
                    above URL.
                  </p>
                  <ul>
                    <li> You can enable or disable custom DNS at any time.</li>
                    <li>
                      <b>NOTE:</b> Depending on your browser, JupyterLab and VS
                      Code may fail in random ways due to security restrictions
                      if you do not enable DNS.
                    </li>
                    <li>
                      <A href="https://youtu.be/Il6rkXaDfUA">
                        <Icon
                          name="youtube"
                          style={{
                            color: "white",
                            background: "#ff0100",
                            padding: "0 3px",
                            borderRadius: "5px",
                            marginRight: "5px",
                          }}
                        />
                        Web Server Demo
                      </A>
                    </li>
                  </ul>
                </>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
