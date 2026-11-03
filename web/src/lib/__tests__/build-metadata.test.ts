/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import { createRsbuild, loadConfig } from '@rsbuild/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('production build revision', () => {
  it.each([
    ['v1.0.0-rc.47-classic-123456789abc', 'v1.0.0-rc.47-classic-123456789abc'],
    ['', '0000'],
  ])(
    'embeds version %j with the real Rsbuild configuration',
    async (version, expected) => {
      vi.stubEnv('VITE_REACT_APP_VERSION', version)
      vi.stubEnv('BUILD_PRIVATE_SECRET', 'must-not-reach-the-browser')
      const directory = await mkdtemp(path.join(os.tmpdir(), 'build-revision-'))
      try {
        const entry = path.join(directory, 'entry.ts')
        const metadataPath = path.join(webRoot, 'src/lib/build-metadata.ts')
        await writeFile(
          entry,
          `import { getBuildRevision } from ${JSON.stringify(metadataPath)};
         globalThis.__BUILD_VERSION_RESULT = getBuildRevision();`
        )
        const config = await loadConfig({ cwd: webRoot, envMode: 'production' })
        // Build only the metadata module, using the real project's definitions.
        // Vitest's import.meta.env stubs alone would hide missing Rspack injection.
        const builder = await createRsbuild({
          cwd: webRoot,
          loadEnv: false,
          rsbuildConfig: {
            mode: 'production',
            source: {
              entry: { index: entry },
              define: config.content.source?.define,
            },
            output: {
              distPath: { root: path.join(directory, 'dist'), js: '' },
              cleanDistPath: true,
              filename: { js: '[name].js' },
              minify: false,
            },
            performance: { printFileSize: false },
            tools: { htmlPlugin: false },
          },
        })
        await builder.build()
        const code = await readFile(
          path.join(directory, 'dist/index.js'),
          'utf8'
        )
        const sandbox: Record<string, unknown> = {}
        sandbox.self = sandbox
        runInNewContext(code, sandbox)
        expect(sandbox.__BUILD_VERSION_RESULT).toEqual(
          expect.stringContaining(`rv.${expected}.`)
        )
        expect(code).not.toContain('must-not-reach-the-browser')
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )
})
