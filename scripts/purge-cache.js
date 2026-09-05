import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const roots = ['node_modules/.vite', 'node_modules/.cache', '.next/cache'];
for (const dir of roots) {
  rmSync(resolve(process.cwd(), dir), { recursive: true, force: true });
}
