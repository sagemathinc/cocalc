import { IssuerData } from "./types";

const pKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAmzcy01Samt/ehVukUhzVbIh4CAHo7njMjuIOnc9b+dajAKHj
WU18E8sVROilLok7VIkKh7zwSZzoqmDZm7viexkZ5sIRqlUHPtojPG2nlCJRCDyW
bVJc8M8haP/7Daa/TcaBz1T6OPJbinqVGAiMDQNU9abY6Mj7kJxaSeTofQUcoWNs
XR5eQOHCPV8GLZresftEW7vOOGhIUO9qBJdnVoDnvmx0LeKAl4EzSTDpz8NMM+OV
aZ5uaR4m84FDttskFqxswEeLnWd+puvTwQ8NPTFPwNh07F+Xrl1N3SN8WU2mvy61
MH4yQ6KyTeNAeqOXgy7VY2DDQDRuhBKwVA1YPQIDAQABAoIBACaPzibGzCpSGByV
qftkgnmWZgvHPbGRfXC6JNt8GuO1OYX8slkLcRoRyFT4X6FyIrVb3qveeuwu+Xbq
3OVeBmSC1faInI7u1P/+feaTb6DT7cHYG59JaSHCtBA8GIlJthmCidmSyR/AxpFe
5w+zf+fzvfXR3+3lkOpajevx3PjCG0i7YkZ/4qd88pDxBVk6G5DzlIIBL80dL4He
zm2FC0D8Giag07R+4Sn+WW8iA9Iej1mhIPLr5Sl+h10JOFQFxAHS6mYQhgQNd+fY
rsonbGkWzUFssT++Dx4ia+BjbI4TTJi5Gw8ov4ciyTY2YnjqragwhM2JJFx8BgPP
nqaTWNkCgYEAzFnbHKzIin7A1B8MScXteiHO00Sy2QrTAFJA0x/Si86dJcvWU3PS
OjSEsEgDHIL0HNXotIyi3ZrV5RIYjV0XvdeAOsspWyn9R1hOZ6akoMFqO8eHeXxh
b/IaEmgGXSAeF9TO6rdnboog+29iU/2enA6/YE6Oqe8fkRVB+RBjZzsCgYEAwnIh
h9pQFf4yQYOt7JN1WBADmiooqHojV+vXTpg8/+nCUBo5Y5dWl9FGOsglG6EcA/AB
sWknlqIC7/ibWZj3wZJdFv45AuB6GMi1qC7SF3Iy9ol++gwJnpDf7SUQVxQ1NTta
Ci2PKNsmE24HR+F4eTlork/QVuzDcau7QznyducCgYEAmU0rmHZyt5thc4CbSljm
z8G/FDUsarC5HDuYkAoGfIWS1MD3V4HDC5FMnaZYVzJSibNbsN70a4T1w7RwoNRe
tDeP5gt1SgPVE4nGv/F+/W48EP6dvmC2BDI+puJNK92lVcF7PRA70uxi0916iYHx
VCeoIEqusgNGziOBa6SEvfMCgYEAhvJEeQ83I3xODo+/pf9UofBDP7vgicRyQPOJ
cp9PPmBSHduFVqvSSfzQW71Jm5o9YjIwSprrAaygk0CbOBxkXfAhMPLwSCHYOtkY
0YblAaac3eLgv9KY3nY3IlLluzloD/CH9aZWw4kMLNHgta8yOBdyof78XUdmAL6p
cOeHcaMCgYBwL0buukBM2CI5aL50mhLTL5rpVPOcM3H3Z5uJbevwtoRIjYC8AsU0
EtYgVDOMTrbh4AO7PTtLFyd9bm53lYy5CbVJ5xb0wyUs9dC5rodRoJXuT8blz2CS
aooSWdkvWOP6M2B2QN7RMr0EGPwHnrFQaMcM3gHqvU6K7jg9AakEfA==
-----END RSA PRIVATE KEY-----`;

export function get_private_key(): string {
  return pKey;
}

const current_auth_flows = {};

export function begin_auth_flow(
  id: string,
  payload: { iss_data: IssuerData }
) {
  current_auth_flows[id] = payload;
}

export function get_auth_flow(
  id: string
): { iss_data: IssuerData } {
  return current_auth_flows[id] || "Nothing here";
}

