import { getCity, getDataStoragePriceRange } from "./util";
import { Alert, Checkbox, Select, Spin } from "antd";
import {
  GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES,
  GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC,
  GOOGLE_CLOUD_MULTIREGIONS,
  GOOGLE_CLOUD_REGIONS,
  DEFAULT_CONFIGURATION,
} from "@cocalc/util/db-schema/cloud-filesystems";
import { useEffect, useMemo, useState } from "react";
import { A, Icon } from "@cocalc/frontend/components";
import { EXTERNAL, NO_CHANGE } from "./create";
import { getRecentRegions } from "./regions";
import { currency } from "@cocalc/util/misc";
import { markup } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { useGoogleCloudPriceData } from "@cocalc/frontend/compute/api";
import { filterOption } from "@cocalc/frontend/compute/util";

export function BucketStorageClass({ configuration, setConfiguration }) {
  const [priceData] = useGoogleCloudPriceData();

  if (priceData == null) {
    return <Spin />;
  }
  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt" }}>
        <A href="https://cloud.google.com/storage/docs/storage-classes">
          {EXTERNAL} Storage Class
        </A>
      </b>
      <br />
      The bucket storage class determines how much it costs to store and access
      your data, but has minimal impact on speed. You can change this later, but
      the change only impacts newly saved data. With nearline, coldline and
      archive storage classes, you have to pay to store any data for at least 30
      days, 90 days, and 1 year, respectively.
      <Alert
        style={{ margin: "10px" }}
        showIcon
        type="info"
        message={`Recommendation: Autoclass`}
        description={
          <>
            Unless you understand why a different choice is better for your
            data, use{" "}
            <A href="https://cloud.google.com/storage/docs/autoclass">
              autoclass
            </A>
            , because the management fee is minimal, there is no extra early
            delete fee, and data you don't touch gets automatically stored
            efficiently, down to a few dollars per TERABYTE after a year. Data
            you frequently access costs the same as standard storage. The
            monthly management fee is only{" "}
            {currency(
              markup({
                cost: 2.5,
                priceData,
              }),
            )}{" "}
            per million blocks (there are 65,536 blocks of size 16 MB in 1 TB of
            data).
          </>
        }
      />
      <Select
        style={{ width: "100%", marginTop: "5px", height: "auto" }}
        options={GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES.map(
          (bucket_storage_class) => {
            const { min, max } = getDataStoragePriceRange({
              ...configuration,
              priceData,
              bucket_storage_class,
            });
            return {
              value: bucket_storage_class,
              key: bucket_storage_class,
              label: (
                <div>
                  <div>
                    {GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC[
                      bucket_storage_class
                    ]?.desc ?? bucket_storage_class}
                  </div>
                  <div style={{ fontFamily: "monospace" }}>
                    {min ? currency(min, 5) : null}
                    {min != max && min && max ? ` - ${currency(max, 5)}` : null}
                    {min && max ? " per GB per month at rest" : null}
                  </div>
                </div>
              ),
            };
          },
        )}
        value={configuration.bucket_storage_class}
        onChange={(bucket_storage_class) =>
          setConfiguration({ ...configuration, bucket_storage_class })
        }
      />
      {configuration.bucket_storage_class.includes("auto") && (
        <Alert
          style={{ margin: "10px 0" }}
          showIcon
          type="warning"
          message={
            <>
              <A href="https://cloud.google.com/storage/docs/autoclass">
                Autoclass buckets
              </A>{" "}
              incur a monthly management fee of{" "}
              {currency(
                markup({
                  cost: 2.5,
                  priceData,
                }),
              )}{" "}
              for every million objects stored in them.
            </>
          }
        />
      )}
    </div>
  );
}

export function BucketLocation({ configuration, setConfiguration }) {
  const [multiregion, setMultiregion] = useState<boolean>(
    configuration.bucket_location &&
      !configuration.bucket_location?.includes("-"),
  );
  const [priceData] = useGoogleCloudPriceData();

  const [recentRegions, setRecentRegions] = useState<string[] | null>(null);
  useEffect(() => {
    if (!configuration.project_id) return;
    (async () => {
      const recent = await getRecentRegions(configuration.project_id);
      setRecentRegions(recent);
    })();
  }, [configuration.project_id]);

  useEffect(() => {
    if (!configuration.bucket_location && recentRegions != null) {
      let bucket_location;
      if (multiregion) {
        if (recentRegions[0]?.startsWith("europe")) {
          bucket_location = "eu";
        } else if (recentRegions[0]?.startsWith("asia")) {
          bucket_location = "asia";
        } else {
          bucket_location = "us";
        }
      } else {
        bucket_location =
          recentRegions[0] ?? DEFAULT_CONFIGURATION.bucket_location;
      }
      setConfiguration({
        ...configuration,
        bucket_location,
      });
    }
  }, [recentRegions, configuration.bucket_location]);

  const options = useMemo(() => {
    let regions = multiregion
      ? GOOGLE_CLOUD_MULTIREGIONS
      : GOOGLE_CLOUD_REGIONS;

    if (multiregion) {
      if (recentRegions?.[0]?.startsWith("europe")) {
        regions = ["eu"].concat(regions.filter((x) => x != "eu"));
      } else if (recentRegions?.[0]?.startsWith("asia")) {
        regions = ["asia"].concat(regions.filter((x) => x != "asia"));
      }
    }
    const options = regions.map((region) => {
      let location;
      const { min, max } = getDataStoragePriceRange({
        ...configuration,
        priceData,
        bucket_location: region,
      });
      if (multiregion) {
        location = `${region.toUpperCase()} (Multiregion)`;
      } else {
        location = region;
      }
      const city = getCity({ region, priceData });
      const label = (
        <div style={{ display: "flex" }}>
          <div style={{ flex: 0.6 }}>
            {location} ({city})
          </div>
          <div style={{ flex: 1, fontFamily: "monospace" }}>
            {min ? currency(min, 5) : null}
            {min != max && min && max ? ` - ${currency(max, 5)}` : null}
            {min && max ? " / GB / month at rest" : null}
          </div>
        </div>
      );
      return {
        value: region,
        label,
        key: region,
        price: { min, max },
        search: `${city} ${location}`,
      };
    });
    if (!multiregion && (recentRegions?.length ?? 0) > 0) {
      const z = new Set(recentRegions);
      const m: { [region: string]: any } = {};
      for (const x of options) {
        if (z.has(x.value)) {
          m[x.value] = x;
        }
      }
      const recent: any[] = [];
      for (const region of recentRegions ?? []) {
        recent.push({ ...m[region], key: `recent-${region}` });
      }

      return [
        {
          label: "Your Recent Compute Servers are in These Regions",
          options: recent,
        },
        { label: "All Regions", options },
      ];
    }
    return options as any[];
  }, [multiregion, priceData, configuration.bucket_storage_class]);

  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt", color: "#666" }}>
        <A href="https://cloud.google.com/storage/docs/locations">
          {EXTERNAL} Location
        </A>
      </b>
      {NO_CHANGE}
      You can use your cloud file system from any compute server in the world,
      in any cloud or self hosted. However, data transfer and operations are{" "}
      <b>faster and cheaper</b> when the file system and compute server are in
      the same region. <br />
      <div style={{ display: "flex", margin: "10px 0" }}>
        <Select
          showSearch
          style={{ flex: 1, width: "300px", marginTop: "5px" }}
          options={options}
          value={configuration.bucket_location}
          onChange={(bucket_location) => {
            setConfiguration({ ...configuration, bucket_location });
            setMultiregion(!bucket_location?.includes("-"));
          }}
          optionFilterProp="children"
          filterOption={filterOption}
        />
        <div
          style={{
            display: "flex",
            textAlign: "center",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 15px",
          }}
        >
          <Checkbox
            onChange={(e) => {
              if (e.target.checked) {
                setMultiregion(true);
                setConfiguration({
                  ...configuration,
                  bucket_location: "",
                });
              } else {
                setMultiregion(false);
                setConfiguration({
                  ...configuration,
                  bucket_location: "",
                });
              }
            }}
            checked={multiregion}
          >
            <Icon name="global" /> Multiregion
          </Checkbox>
        </div>
      </div>
    </div>
  );
}
