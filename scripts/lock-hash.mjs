import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

process.stdout.write(createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'));
