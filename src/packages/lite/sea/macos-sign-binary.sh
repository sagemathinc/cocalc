set -ev

# https://chatgpt.com/c/68ae4247-13e0-832f-9cc6-90b97a6141d9

# name and id comes from:
#   security find-identity -v -p codesigning | grep "Developer ID Application"

# xcrun notarytool store-credentials "notary-profile" --apple-id "wstein@gmail.com" --team-id "BVF94G2MB4"


codesign --force --sign "Developer ID Application: William STEIN (BVF94G2MB4)" \
  --options runtime \
  --entitlements entitlements.plist \
  ./cocalc
  

# verify locally
codesign --verify --deep --strict --verbose=2 ./cocalc


# this will fail:
spctl --assess --type execute --verbose=2 ./cocalc


#ditto -c -k --keepParent ./cocalc cocalc-mac.zip
# This actually uploads it to apple:
# xcrun notarytool submit cocalc-mac.zip \
#   --keychain-profile "notary-profile" \
#   --wait --progress


# build payload
rm -rf payload && mkdir -p payload/usr/local/bin
cp ./cocalc payload/usr/local/bin/

export VERSION=0.2.0
# build unsigned pkg
pkgbuild --root payload \
  --identifier com.cocalc.cli \
  --version $VERSION \
  --install-location / \
  unsigned.pkg

# sign the pkg with your *Installer* cert
productsign --sign "Developer ID Installer: William STEIN (BVF94G2MB4)" \
  unsigned.pkg cocalc-$VERSION.pkg

# notarize & staple the pkg
xcrun notarytool submit cocalc-$VERSION.pkg --keychain-profile "notary-profile" --wait --progress

xcrun stapler staple cocalc-$VERSION.pkg




