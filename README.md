This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Cloudflare migration verification

The Cloudflare candidate retains the genuine Next server action, public dynamic
GET API, original parser, React Query UI and Geist fonts. Only acquisition changes
from native Chromium to a fixed-origin HTTP read of server-rendered data. This
transport does not execute provider JavaScript. Reviewed204/205 and literal-text
MIME semantics are preserved; the JavaScript mutation negative control stays
explicitly non-equivalent.

Next16.4.3/OpenNext1.20.14/Webpack are the reviewed compatibility candidate;
React/React DOM remain19.2.0. Run `npm test` for lightweight synthetic HTTP tests.
The public-repository workflow builds original Next16.0.10 and the candidate on
Linux, then checks genuine action/RSC, API, loading/success/error UI, fonts,
redirects, status/MIME cases, real60s header/body cleanup and unchanged sealed
Worker/assets bytes. A green local unit suite is not full integration acceptance.

Verification CI has read-only repository permission and no application/provider
secrets, deployment step, content/artifact upload, writable cache, or preview
creation. Live SGPC/Vercel scraper hosts are blocked; only synthetic loopback
fixtures feed tests. The original source is read from frozen commit
`9a83971250ef7bf020684c8a7beaa2af5d5590c0`, without initializing the inactive
submodule. Original reference packages install without lifecycle scripts.

The Wrangler configuration disables workers.dev and preview URLs. No account,
Worker deployment, DNS change or consumer cutover is performed by this branch.
Those steps require the later exact-artifact/account acceptance gates. Full local
builds also require a fresh3072MiB disk reservation; CI is the current full-build
verification path. See `docs/cloudflare-verification.md` for evidence and limits.
