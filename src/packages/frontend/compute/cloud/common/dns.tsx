import { DNS_COST_PER_HOUR, checkValidDomain } from "@cocalc/util/compute/dns";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Input, Typography } from "antd";
import { A, Icon } from "@cocalc/frontend/components";
import { currency } from "@cocalc/util/misc";
import { debounce } from "lodash";
import { isDnsAvailable } from "@cocalc/frontend/compute/api";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

async function checkDns(dns, setDnsError) {
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
  }
}

export default function DNS({ setConfig, configuration, loading }) {
  const compute_servers_dns = useTypedRedux("customize", "compute_servers_dns");
  const [showDns, setShowDns] = useState<boolean>(!!configuration.dns);
  const [dnsError, setDnsError] = useState<string>("");
  const [dns, setDns] = useState<string | undefined>(configuration.dns);
  const checkValid = useMemo(() => {
    const f = reuseInFlight(async (dns) => {
      await checkDns(dns, setDnsError);
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
      <Checkbox
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
        DNS: Custom Subdomain with SSL ({currency(DNS_COST_PER_HOUR)}/hour when
        running or stopped)
      </Checkbox>
      {showDns && (
        <A
          style={{ float: "right" }}
          href={`https://${configuration.dns}.${compute_servers_dns}`}
        >
          <Icon name="external-link" /> https://{dns ?? "*"}.
          {compute_servers_dns}
        </A>
      )}
      {showDns && (
        <div style={{ marginTop: "5px" }}>
          <Input
            disabled={loading}
            style={{ margin: "15px 0" }}
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

          <Button
            disabled={configuration.dns == dns || dnsError || loading}
            onClick={async () => {
              if (await checkDns(dns, setDnsError)) {
                const s = (dns ?? "").toLowerCase();
                setConfig({ dns: s });
                setDns(s);
              }
            }}
          >
            {!dns || configuration.dns != dns
              ? "Enable Custom Domain"
              : "Custom Domain Enabled"}
          </Button>
          <div style={{ color: "#666", margin: "5px 0" }}>
            <Typography.Paragraph
              style={{ color: "#666" }}
              ellipsis={{
                expandable: true,
                rows: 2,
                symbol: "more",
              }}
            >
              A custom DNS A record with{" "}
              <A href="https://developers.cloudflare.com/dns/manage-dns-records/reference/proxied-dns-records/">
                https and http proxying will be created at CloudFlare
              </A>{" "}
              as long as your VM is not deprovisioned. Whenever your VM starts
              running it is allocated an external ip address, and CoCalc updates
              the DNS entry to point at that ip address. A web server with
              self-signed certificate will appear to have a proper certificate
              to website visitors. You can enable or disable custom DNS at any
              time.
            </Typography.Paragraph>
          </div>
          {dns && dnsError && (
            <div
              style={{
                background: "red",
                color: "white",
                padding: "5px",
                margin: "10px 0",
              }}
            >
              {dnsError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
