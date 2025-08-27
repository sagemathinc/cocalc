set -ev

cp "$(command -v node)" cocalc

cp ../cocalc-lite.tar.gz .

if [ `uname` == "Darwin" ]; then
  codesign --remove-signature cocalc
fi

node --experimental-sea-config sea-config.json

if [ `uname` == "Linux" ]; then
    npx postject hello NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 
fi

if [ `uname` == "Darwin" ]; then
   # 2) Inject the SEA blob (macOS needs the Mach-O segment name)
    npx postject cocalc NODE_SEA_BLOB sea-prep.blob \
      --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
      --macho-segment-name NODE_SEA

    # 3) Re-sign (ad-hoc is fine for local testing)
    codesign --sign - cocalc
fi
