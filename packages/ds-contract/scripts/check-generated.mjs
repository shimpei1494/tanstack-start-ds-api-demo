import { readFileSync } from 'node:fs';
import openapiTS, {
  astToString,
  COMMENT_HEADER,
} from '../../../tools/openapi-codegen/node_modules/openapi-typescript/dist/index.mjs';

const generated =
  COMMENT_HEADER + astToString(await openapiTS(new URL('../openapi.json', import.meta.url)));
const saved = readFileSync(new URL('../src/openapi.ts', import.meta.url), 'utf8');
if (saved !== generated) {
  throw new Error('Generated TypeScript contract is stale. Run npm run contract:generate.');
}
console.log('Generated TypeScript contract matches saved OpenAPI.');
