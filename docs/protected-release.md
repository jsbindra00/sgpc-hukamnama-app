# Protected automatic release preparation

Release activation is **false**. `workers_dev:false` and `preview_urls:false`
remain in the source configuration. This change creates no resources,
credentials, Access applications, domains, previews or deployments.

The original Vercel project has `all_except_custom_domains` protection and no
custom hostname. Preserve its owner login requirement for the whole migrated
site, API, RSC transport and static assets. A public synthetic CI pass does not
authorize exposing the application.

## Same-job exact-byte upload

The existing workflow retains the full original Next16.0.10/candidate16.4.3
verification, 28 API cases, two real UI references, concurrency, original retry
behavior and deadlines, and the complete 45-file seal. After those checks finish,
`node scripts/protected-release.mjs record` binds their evidence and complete
manifest to clean source HEAD, source configuration and the current GitHub
run/attempt/job. It uses no credentials and can run on a pull request.

Only a `push` to `jsbindra00/sgpc-hukamnama-app` main with repository variable
`SGPC_PROTECTED_RELEASE_ENABLED=true` reaches the upload step. Its matching
Worker-only secret is supplied only to that step. Dispatch and PR verification
have no deployment credential. No preview path exists. Main runs finish in order;
new PR runs may cancel old PR verification.

The release script checks the current source, full acceptance, seal and same-job
receipt again. It creates a separate upload configuration without changing any
sealed bytes, targets only account `4abb2d00cad9a3253e7d65e3eadbacf2` and Worker
`sgpc-hukamnama-scraper`, and invokes the installed pinned Wrangler4.154.0 directly
with `--config`, `--no-autoconfig`, `--no-bundle`, `find_additional_modules:false`
and `upload_source_maps:false`. The tested standalone `worker/worker.js` is the
only upload module. Its debug map, build graph and companion remain accounted
for in the seal; they are excluded from served assets and module discovery.
There is no build or package install between acceptance and upload.

## Root-controlled activation

Root must review the isolated patch before any push or remote action. Separately,
root must reserve the exact named Worker with ingress disabled, verify the target
account, and attach owner-only Access to **all traffic** before enabling a URL.
The existing reusable owner policy is a starting point, not proof that this Worker
has an Access application or that the owner can sign in. Do not add a bypass,
service-auth policy, alternative hostname, public fallback or service token.

`cloudflare/protected-release.json` is an intentionally incomplete **static root
review receipt**, not an API query or a proof generator. Root must supply the
actual per-Worker application ID/audience, policy IDs, exact hostname, SHA256 of
the confirmed owner email, and SHA256 of private evidence of attachment, policy
inspection, anonymous denial and actual owner sign-in. Hashes keep email and
private evidence out of this public repository. Record only public identifiers
and sanitized attestations here; never commit a cookie, JWT, token or raw page.
Root must also attest that the expiring CI credential permits editing only this
Worker and has no Access, DNS, other Worker or account-management permissions.
The code can validate these assertions' structure and target identity; their
truth comes from root's separately reviewed live evidence. A fabricated receipt
or a generic policy ID does not establish protection.

After that evidence exists, root may review a change enabling the receipt and
`workers_dev` together, while retaining `preview_urls:false`, and may configure
the one matching repository secret and release variable. A pre-upload anonymous
check must already see the protected reserved endpoint. If Access is disabled,
unverified, or the owner cannot sign in, keep all activation flags false.

The anonymous checker requires 302 to the known HTTPS Cloudflare Access login
host on the root, API, RSC URL and one genuine sealed asset. It retries only
temporary network errors/404s within 45 seconds per route. Public content and
other statuses or redirects fail immediately. It runs before and after upload.
This establishes denial only. It cannot compare private live asset bytes.

## Separate authenticated acceptance

After a protected deployment, root must use the correct owner's authenticated
session to verify deployed identity/build, status and exact bytes of every
served sealed asset, both primary fonts, the real API result and current date,
and the unchanged browser loading/success/error/retry and Next-Action journeys.
Keep credentials and captured scripture out of logs and artifacts. Verify the
provider from the actual Cloudflare runtime with the separately authorized
bounded pilot; a Node HTTPS baseline is only Node-origin reachability and
original/candidate parser evidence. Anonymous redirects prove neither live
application bytes nor Cloudflare-origin provider reachability.

Retain the Vercel deployment and existing consumer compatibility until these
separate gates pass. A failed post-upload protection check requires root to
disable ingress and repair Access; the Worker-only CI token cannot manage Access
or independently restore a broken policy.
