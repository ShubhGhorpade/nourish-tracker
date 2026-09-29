import { writeFile } from 'node:fs/promises';
const meta = { builtAt: new Date().toISOString(), version: '1.0.0' };
await writeFile('dist/build-meta.json', JSON.stringify(meta, null, 2));
