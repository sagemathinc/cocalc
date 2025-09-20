
# Makefile for macOS SEA → signed → pkg → notarized → stapled
# See https://chatgpt.com/share/68b8cea9-d3cc-800e-837d-2e66061ebff2

# ======= config you’ll likely tweak =======
APP_NAME       ?= cocalc
VERSION        ?= 0.2.0
TEAM_ID        ?= BVF94G2MB4
PROFILE        ?= notary-profile

# Identities exactly as shown by `security find-identity -v -p codesigning`
DEV_APP_ID     ?= Developer ID Application: William STEIN ($(TEAM_ID))
DEV_INST_ID    ?= Developer ID Installer: William STEIN ($(TEAM_ID))

# SEA inputs (only needed if you want `make sea`)
SEA_MAIN       ?= cocalc.js
SEA_CONFIG     ?= sea-config.json                 # writes sea-prep.blob + sea.term
NODE_BIN       ?= $(shell command -v node)

# ======= derived paths =======
BIN            := ./$(APP_NAME)
PAYLOAD_DIR    := ./payload
PKG_UNSIGNED   := ./unsigned.pkg
PKG_SIGNED     := ./$(APP_NAME)-$(VERSION).pkg

# Read the SEA fuse value that `node --experimental-sea-config` emits (first line)
FUSE           := $(shell [ -f sea.term ] && sed -n '1p' sea.term)

.SHELLFLAGS := -euo pipefail -c

.PHONY: help sea sign-bin verify-bin pkg sign-pkg notarize staple release clean veryclean show-ids entitlements

help:
	@echo "Targets:"
	@echo "  make sea         # (optional) build & inject SEA into $(BIN)"
	@echo "  make sign-bin    # sign SEA binary with hardened runtime + entitlements"
	@echo "  make verify-bin  # local codesign + Gatekeeper checks"
	@echo "  make pkg         # build unsigned pkg that installs $(BIN) to /usr/local/bin"
	@echo "  make sign-pkg    # sign the pkg with Developer ID Installer"
	@echo "  make notarize    # notarize the signed pkg with notarytool (profile: $(PROFILE))"
	@echo "  make staple      # staple the notarization ticket to the pkg"
	@echo "  make release     # sign-bin → pkg → sign-pkg → notarize → staple"
	@echo "  make show-ids    # list available signing identities"
	@echo "  make entitlements # generate a minimal entitlements.plist if you don't have one"

# ---- info helpers ----
show-ids:
	security find-identity -v -p codesigning login.keychain-db || true

entitlements:
	@[ -f entitlements.plist ] || { \
	  cat > entitlements.plist <<'PLIST'; \
	  <?xml version="1.0" encoding="UTF-8"?> \
	  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"> \
	  <plist version="1.0"><dict> \
	    <key>com.apple.security.cs.allow-jit</key><true/> \
	    <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/> \
	    <key>com.apple.security.cs.disable-library-validation</key><true/> \
	  </dict></plist> \
	  PLIST \
	  echo "wrote minimal entitlements.plist"; \
	}

# ---- SEA build/inject (optional if you already have ./cocalc) ----
sea: clean-sea
	@[ -x "$(NODE_BIN)" ] || (echo "node not found" && exit 1)
	@echo "→ Copy node → $(BIN) and strip any existing signature"
	cp "$(NODE_BIN)" "$(BIN)"
	codesign --remove-signature "$(BIN)" 2>/dev/null || true
	@echo "→ Generate SEA blob from $(SEA_CONFIG)"
	node --experimental-sea-config "$(SEA_CONFIG)"
	@[ -s sea-prep.blob ] || (echo "sea-prep.blob missing" && exit 1)
	@[ -s sea.term ] || (echo "sea.term missing (fuse) — ensure Node wrote it" && exit 1)
	@echo "→ Inject SEA blob (Mach-O segment + sentinel fuse)"
	npx -y postject@latest "$(BIN)" NODE_SEA_BLOB sea-prep.blob \
	  --sentinel-fuse "$(FUSE)" \
	  --macho-segment-name NODE_SEA
	@echo "SEA injection done: $(BIN)"

clean-sea:
	rm -f sea-prep.blob sea.term

# ---- sign the binary ----
sign-bin: entitlements
	@echo "→ Signing binary with Developer ID Application + hardened runtime"
	codesign --force --sign "$(DEV_APP_ID)" \
	  --options runtime \
	  --entitlements entitlements.plist \
	  "$(BIN)"
	@echo "→ codesign verify"
	codesign --verify --deep --strict --verbose=2 "$(BIN)"

verify-bin:
	@echo "→ Gatekeeper (may show 'Unnotarized Developer ID' until you ship a pkg)"
	spctl --assess --type execute --verbose=4 "$(BIN)" || true

# ---- pkg build/sign ----
pkg:
	rm -rf "$(PAYLOAD_DIR)"
	mkdir -p "$(PAYLOAD_DIR)/usr/local/bin"
	cp "$(BIN)" "$(PAYLOAD_DIR)/usr/local/bin/$(APP_NAME)"
	pkgbuild --root "$(PAYLOAD_DIR)" \
	  --identifier com.$(APP_NAME).cli \
	  --version "$(VERSION)" \
	  --install-location / \
	  "$(PKG_UNSIGNED)"
	@echo "→ built $(PKG_UNSIGNED)"

sign-pkg:
	@[ -f "$(PKG_UNSIGNED)" ] || (echo "$(PKG_UNSIGNED) missing. Run 'make pkg'." && exit 1)
	productsign --sign "$(DEV_INST_ID)" "$(PKG_UNSIGNED)" "$(PKG_SIGNED)"
	@echo "→ signed $(PKG_SIGNED)"

# ---- notarize + staple the pkg ----
notarize:
	@[ -f "$(PKG_SIGNED)" ] || (echo "$(PKG_SIGNED) missing. Run 'make sign-pkg'." && exit 1)
	xcrun notarytool submit "$(PKG_SIGNED)" \
	  --keychain-profile "$(PROFILE)" \
	  --wait --progress

staple:
	xcrun stapler staple "$(PKG_SIGNED)"
	@echo "→ stapled $(PKG_SIGNED)"
	@echo "Gatekeeper check:"
	spctl --assess --type install --verbose=4 "$(PKG_SIGNED)" || true

# ---- one-shot release pipeline ----
release: sign-bin pkg sign-pkg notarize staple
	@echo "✅ Release artifact ready: $(PKG_SIGNED)"

clean:
	rm -rf "$(PAYLOAD_DIR)" "$(PKG_UNSIGNED)" "$(PKG_SIGNED)"

veryclean: clean clean-sea
	rm -f "$(BIN)"
