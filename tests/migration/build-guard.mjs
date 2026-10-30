import fs from 'node:fs';
const disk=fs.statfsSync(process.cwd());
const availableMiB=Math.floor(disk.bavail*disk.bsize/1048576);
console.log(JSON.stringify({availableMiB,minimumBuildLaunchMiB:3072}));
if(availableMiB<3072){console.error('Next/OpenNext build blocked: the required 3072MiB free-disk reserve is unavailable.');process.exitCode=1;}
