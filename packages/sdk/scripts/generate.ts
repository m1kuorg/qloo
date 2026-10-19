// Generates src/openapi.ts, the SDK's types, from openapi.json, the API's document as the Worker
// serves it, which `bun run generate` has apps/test/sdk.test.ts write first. The header names the
// document's hash, so that test fails once the Worker's document changes and the types don't.
// openapi-typescript is installed at the repo root: it needs TypeScript 5's compiler API.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import openapiTS, { COMMENT_HEADER, astToString } from 'openapi-typescript'

const source = new URL('../openapi.json', import.meta.url)
const hash = createHash('sha256')
  .update(await readFile(source, 'utf8'))
  .digest('hex')
const types = astToString(await openapiTS(source))
await writeFile(
  new URL('../src/openapi.ts', import.meta.url),
  `// From openapi.json, sha256 ${hash}.\n${COMMENT_HEADER}${types}`
)
