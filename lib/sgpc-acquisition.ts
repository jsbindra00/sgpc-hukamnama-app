import 'server-only';
import { load } from 'cheerio';

const SOURCE_URL = 'https://hs.sgpc.net/';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Accepted scope: this fixed source's existing server-rendered data. This does
// not execute page JavaScript; the mutation negative control stays non-equivalent.
export async function acquireSGPCHTML(): Promise<string> {
  const response = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  if (response.status === 204 || response.status === 205) {
    await response.body?.cancel();
    throw new Error('Navigation aborted by upstream status ' + response.status);
  }
  const body = await response.text();
  const mediaType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType === 'text/plain' || mediaType === 'application/json') {
    const $ = load('<pre></pre>');
    $('pre').text(body);
    return $.html();
  }
  return body;
}
