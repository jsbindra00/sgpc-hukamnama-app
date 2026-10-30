# SGPC migration baseline

The original source is `9a83971250ef7bf020684c8a7beaa2af5d5590c0` on `jsbindra00/sgpc-hukamnama-app` (`main`). Authenticated Vercel metadata still assigns `sgpc-hukamnama-scraper.vercel.app` to `dpl_BFzCbtq6ZV43mrvPMQNWJgVHBGd8` at that commit. The GitHub repository is public; `package.json`'s `private: true` prevents package publication and does not describe repository visibility. No visibility change is requested.

`migration/source-provenance.json` freezes all 25 original file hashes and the inactive `sgpc-scraper-script` gitlink (`d67b5cf107be95b5da1b538f95eabc5e9a3a7ea1`). There is no `.gitmodules` file, and the application does not import this gitlink. Do not initialize an unknown submodule or replace its recorded commit.

The migrated tree omits this unused, uninitialized gitlink as an authorized hosting
exception. The first Linux CI run failed in checkout's temporary-auth cleanup:
`git submodule foreach --recursive` rejects its missing `.gitmodules` URL even
with `submodules: false`. The frozen original commit and recorded gitlink pointer
remain unchanged. No package, script, import or runtime depends on this path; no
initialized submodule files were removed and no replacement URL was invented.

## Existing behavior

- The page renders the existing React Query skeleton and calls the `getHukamnama` Next server action from the client. An API-only static export would drop an active transport.
- `GET /api/hukamnama` is explicitly dynamic, invokes the same action, and returns `{date, ang, title, lines:[{gurmukhi, translation}]}`. There is no application auth, persistent database, server-side cache or scheduler in the original source. React Query sets a 60-second client stale time.
- Production launches `@sparticuz/chromium` 141.0.0 through `puppeteer-core` 24.31.0. Development uses Puppeteer 24.31.0. Both navigate only to `https://hs.sgpc.net/`, wait for `networkidle2` with a 60-second navigation timeout, capture HTML and close the browser before parsing.
- Cheerio 1.1.2 extracts the date, first Gurmukhi card (with the original card-class fallback), title, last ang label and English translation card. The stanza, Rahau, danda and English sentence distribution algorithm must remain unchanged.
- Missing selectors currently produce empty strings/lines, rather than validation errors. Browser failures are mapped to the existing action error and API 500 payload; preserve measured behavior rather than inventing a new response contract.
- `stv-hukamnama-replacer/shared/hukamnama-fetcher/index.ts` calls the existing Vercel API as its fallback when the primary provider fails or has the wrong date. That consumer must be migrated before the old endpoint can be retired.

## Read-only preflight

Anonymous GET/HEAD `/` returned 200, API OPTIONS returned 204 with `GET, HEAD, OPTIONS`, and a fixed missing path returned 404. These observations override generic project-level SSO metadata when determining existing public behavior. The production scraping GET and server action were not invoked.

One ordinary anonymous GET of the published SGPC source returned 25,755 bytes containing all text selectors required by the existing parser, including Gurmukhi and English content. This supports trying a bounded HTTP-only acquisition boundary before provisioning a browser service. It does not establish rendered-versus-raw parity or reachability from Cloudflare.

## Next local experiment

Preserve the Next page, server action, API, source parser and public behavior. First compare the unchanged parser's output on synthetic raw and locally rendered page fixtures, including meaningful JavaScript mutation cases. Use the genuine parser and real workerd HTTP boundary. If HTTP-only acquisition passes that proof and a separately controlled Cloudflare-origin read, it avoids a browser binding and browser billing. Do not disguise HTTP fetching as a fake Puppeteer SDK.

If rendering is necessary, use the official Browser Run binding with its documented Puppeteer or rendered-content interface. The installed native Chromium executable cannot run unchanged inside Workers. Browser quota, actual account capability, explicit usage authorization, request isolation, timeout/cleanup, bot reachability and the selected SDK version remain gates. Neither service activation nor a remote browser session is part of this preflight.

No adapter, workflow or deployment configuration has been implemented. No dependencies were installed, browser binaries downloaded, credentials read, provider jobs triggered, or remote resources changed.
