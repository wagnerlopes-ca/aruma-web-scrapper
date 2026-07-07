import { config } from 'dotenv';
import { resolve } from 'path';

config({
  path: resolve(process.cwd(), 'apps/apis/aruma/src/app/.env'),
  quiet: true,
});
