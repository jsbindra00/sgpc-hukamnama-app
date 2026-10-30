import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// The source has no server data cache/ISR requirement or storage bindings.
export default defineCloudflareConfig({
  incrementalCache: 'dummy',
  tagCache: 'dummy',
  queue: 'dummy',
  cachePurge: 'dummy',
});
