# Cloudflare verification scope

This branch prepares a hosting adapter, credential-free verification and disabled
protected automatic release. Deployment and Cloudflare-origin access remain
separate gates. See `protected-release.md` for the root-controlled activation and
authenticated live acceptance requirements.

The original25 source blobs are frozen in `migration/source-provenance.json`.
`tests/migration/source-invariants.mjs` checks protected original UI/API/font files,
the exact parser SHA and allowed hosting configuration exceptions. The native
acquisition boundary is the sole business-source exception. Next16.0.10 to16.4.3
is a reviewed MINOR update, paired with OpenNext1.20.14 and Webpack. No peer
constraint is bypassed. React/React DOM19.2.0 and other UI dependencies are retained.

The unused, uninitialized `sgpc-scraper-script` gitlink is omitted from the active
migration tree because its missing `.gitmodules` URL breaks checkout's temporary
auth cleanup even with submodules disabled. Its exact pointer remains in the
frozen original tree and provenance. Source invariants and a disposable local
Git regression check this hosting exception; credentials remain nonpersistent
and no submodule URL or initialization is added.

The candidate uses a fixed source URL/UA, follow redirects, no server cache and a
60000ms signal through headers/body. Only reviewed204/205 aborts and literal-text
interpretation for text/plain/application/json supplement the unchanged parser.
The accepted source has server-rendered data. JavaScript mutation remains a
negative control; other MIME/encoding/rendering combinations are not universally
claimed compatible.

Linux CI first archives the exact public original source from local Git history.
It installs original packages with scripts disabled and builds real Next16.0.10.
Its test-only preload runs the real original native browser/action/parser and
routes only the browser navigation boundary to synthetic loopback HTTP. The
candidate is built with real Next/OpenNext and bundled using Wrangler dry-run.
Every emitted module, graph and static asset is inventoried and hashed. Miniflare
serves those exact sealed bytes and ASSETS with a strict fixture-only outbound
service. No alternate production URL, test handler, mock parser or test-only
framework transport is compiled into the candidate.

The workflow then compares full original/candidate API objects, measured MIME and
status behavior, redirects/errors, concurrent independent requests and real60s
header/body cleanup. A browser mounts the unchanged React Query component and
must exercise its real compiled Next-Action POST/Flight transport. Loading,
success, existing error/retry behavior and both original font assets are checked.
If genuine baseline or candidate behavior fails, CI must remain red; this branch
does not rewrite business UI behavior to hide a failure.

All uploaded repository content is original public source or synthetic fixtures.
Captured provider HTML/text never enters this repository. Verification does not
upload generated content/artifacts; evidence manifests and synthetic outcomes are
logged. Verification has contents:read only, no credentials, no
pull_request_target, no cache writes and no remote binding. Only a trusted main
push after full same-job acceptance and separate reviewed protection gates can
reach the disabled-by-default upload step and its matching Worker-only secret.
CI source/production scraper hosts are blocked at the runner in addition
to the fixture network controls. Full runtime verification uses a Linux network
namespace with only loopback up; after setup it drops back to the runner UID,
removes capabilities and sets no-new-privileges. No actual SGPC or production API request is part
of verification. Official font/npm build inputs are ordinary public package/font
reads, not scraper content.

Independent CI-safety review and controller push must precede any workflow run.
Only an actual successful run can establish genuine transport/UI and sealed byte
proof for its revision. A separately gated bounded Cloudflare-origin GET must
establish provider reachability during the protected pilot, before cutover and
fallback consumer acceptance. The old Vercel service and consumers stay intact.
