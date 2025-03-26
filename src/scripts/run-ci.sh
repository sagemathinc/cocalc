set -ev

pnpm clean
pnpm build-dev
pnpm test
