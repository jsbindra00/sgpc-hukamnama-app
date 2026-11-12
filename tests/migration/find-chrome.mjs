import fs from 'node:fs';
import assert from 'node:assert/strict';
const file=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(x=>fs.existsSync(x));
assert.ok(file,'The runner must provide Chrome; this workflow does not download a browser');
assert.ok(process.env.GITHUB_ENV);fs.appendFileSync(process.env.GITHUB_ENV,'SGPC_TEST_CHROME='+file+'\n');console.log('Using preinstalled Chrome: '+file);
