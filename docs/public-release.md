# Cloudflare production deployment

Production uses the existing
[SGPC Worker](https://sgpc-hukamnama-scraper.shy-bonus-2f1d.workers.dev)
in the Jas Singh account. The canonical hostname is public. Version URLs
are disabled. The repository Wrangler config keeps both URL flags off for
fixture builds. The release step generates a config for the canonical
hostname from the exact accepted artifact.

Automatic promotion requires repository variable
`SGPC_PUBLIC_RELEASE_ENABLED=true` and repository secret
`CLOUDFLARE_API_TOKEN`. Set the secret to an Individual Workers Editor token
scoped to `sgpc-hukamnama-scraper` in account
`4abb2d00cad9a3253e7d65e3eadbacf2`. Pull requests and manual dispatches run the
verification steps without the secret. Only a push to this repository's main
branch can promote an accepted version. Turning the variable off stops
automatic promotion.

`vercel.json` disables automatic Vercel deployments on `main` and the
`codex/cloudflare-migration` review branch. Preserve the Vercel fallback at
`sgpc-hukamnama-scraper.vercel.app`, which serves the Chromium scraper from
`9a83971250ef7bf020684c8a7beaa2af5d5590c0` on deployment
`dpl_BFzCbtq6ZV43mrvPMQNWJgVHBGd8`. Verify the alias still resolves to that
deployment after merging the Cloudflare changes. Other branches keep Vercel's
default Git deployment behavior.

The workflow runs the full original and candidate acceptance suite and binds
the seal to the same job and commit. It checks that main is current, the
existing production deployment serves one version at 100%, and Cloudflare
reports the canonical hostname enabled and version URLs disabled. It uploads
the accepted standalone Worker with pinned Wrangler 4.154.0, the matching
assets and module discovery disabled. It verifies the immutable Worker
identifier and refuses promotion if Wrangler reports a version URL or if the
main commit or active deployment changed during upload.

After promotion, the workflow checks the public app shell and route behavior
and verifies one JavaScript and one CSS asset against the sealed manifest. It
then makes one bounded live API request and checks the JSON shape without
logging the Hukamnama response.

If confirmation or public smoke fails, the job attempts to restore the
recorded previous version at 100% traffic. It checks that the exact candidate
deployment is still active before restoring it and verifies the restored
deployment afterward. Keep manual releases separate from the main release
job because Cloudflare reports the active deployment and changes traffic in
separate operations. A failed job without a confirmed promotion receipt
requires checking deployment history before taking further action.
