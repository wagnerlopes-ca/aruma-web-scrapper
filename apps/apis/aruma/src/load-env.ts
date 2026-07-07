import { existsSync } from 'fs';
import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), 'apps/apis/aruma/src/app/.env');

if (existsSync(envPath)) {
  config({ path: envPath });
}
