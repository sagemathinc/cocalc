import { getGoogleCloudPriceData } from "@cocalc/frontend/compute/api";
import type { GoogleCloudData } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { currency } from "@cocalc/util//misc";
import { getDataStoragePriceRange } from "./util";
import { Alert, Checkbox, Select } from "antd";
import {
  GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES,
  GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC,
  GOOGLE_CLOUD_MULTIREGIONS,
  GOOGLE_CLOUD_REGIONS,
} from "@cocalc/util/db-schema/cloud-filesystems";
import { useEffect, useMemo, useState } from "react";
import { A, Icon } from "@cocalc/frontend/components";
import { EXTERNAL, NO_CHANGE } from "./create";

export function BucketStorageClass({ configuration, setConfiguration }) {
  const [prices, setPrices] = useState<null | GoogleCloudData>(null);
  useEffect(() => {
    (async () => {
      setPrices(await getGoogleCloudPriceData());
    })();
  }, []);
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
      the change only impacts newly saved data. The classes other than
      "standard" incur early retrieval fees.
      <Select
        style={{ width: "100%", marginTop: "5px", height: "auto" }}
        options={GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES.map(
          (bucket_storage_class) => {
            const { min, max } = getDataStoragePriceRange({
              ...configuration,
              prices,
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
                    ] ?? bucket_storage_class}
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
              incur a monthly fee of about $3 for every million objects stored
              in them. Each object corresponds to a block of a file, so if you
              have a large number of small files (or a small filesystem block
              size), the autoclass management fee can be substantial. E.g., if
              your cloud filesystem contains 1,000 GB of data broken into 10
              million blocks, the cost would be about $30/month to manage the
              autoclass blocks and between $1 and $50 to store the data,
              depending on how old it is. Make sure to user a large block size
              (see below). If you're archiving your data, instead make a bucket
              with a nearline, coldline or archive storage class.
            </>
          }
        />
      )}
    </div>
  );
}

export function BucketLocation({ configuration, setConfiguration }) {
  const [multiregion, setMultiregion] = useState<boolean>(
    !configuration.bucket_location?.includes("-"),
  );
  const [prices, setPrices] = useState<null | GoogleCloudData>(null);
  useEffect(() => {
    (async () => {
      setPrices(await getGoogleCloudPriceData());
    })();
  }, []);

  const options = useMemo(() => {
    let regions = multiregion
      ? GOOGLE_CLOUD_MULTIREGIONS
      : GOOGLE_CLOUD_REGIONS;
    return regions.map((region) => {
      let location;
      const { min, max } = getDataStoragePriceRange({
        ...configuration,
        prices,
        bucket_location: region,
      });
      if (multiregion) {
        location = `${region.toUpperCase()} (Multiregion)`;
      } else {
        location = region;
      }
      const label = (
        <div style={{ display: "flex" }}>
          <div style={{ flex: 0.5 }}>{location}</div>
          <div style={{ flex: 1, fontFamily: "monospace" }}>
            {min ? currency(min, 5) : null}
            {min != max && min && max ? ` - ${currency(max, 5)}` : null}
            {min && max ? " per GB per month at rest" : null}
          </div>
        </div>
      );
      return { value: region, label, key: region, price: { min, max } };
    });
  }, [multiregion, prices, configuration.bucket_storage_class]);

  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt", color: "#666" }}>
        <A href="https://cloud.google.com/storage/docs/locations">
          {EXTERNAL} Location
        </A>
      </b>
      {NO_CHANGE}
      You can use your cloud filesystem from any compute server in the world, in
      any cloud or on prem. However, data transfer and operations are{" "}
      <b>faster and cheaper</b> when the filesystem and compute server are in
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
                  bucket_location: "us",
                });
              } else {
                setMultiregion(false);
                setConfiguration({
                  ...configuration,
                  bucket_location: "us-east1",
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
