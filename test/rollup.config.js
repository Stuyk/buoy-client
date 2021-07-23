/* eslint-disable no-undef */

import fs from 'fs'
import path from 'path'

import alias from '@rollup/plugin-alias'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import virtual from '@rollup/plugin-virtual'

const testFiles = fs
    .readdirSync(__dirname)
    .filter((f) => f.match(/\.ts$/))
    .map((f) => path.join(__dirname, f))

const template = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tests</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="https://unpkg.com/mocha/mocha.css" />
  </head>
  <body>
    <div id="mocha"></div>
    <script src="https://unpkg.com/chai/chai.js"></script>
    <script src="https://unpkg.com/mocha/mocha.js"></script>
    <script class="mocha-init">
      mocha.setup('tdd');
      mocha.checkLeaks();
    </script>
    <script>%%tests%%</script>
    <script class="mocha-exec">
      mocha.run();
    </script>
  </body>
</html>
`

function inline() {
    return {
        name: 'Inliner',
        generateBundle(opts, bundle) {
            const file = path.basename(opts.file)
            const output = bundle[file]
            delete bundle[file]
            const code = `${output.code}\n//# sourceMappingURL=${output.map.toUrl()}\n`
            this.emitFile({
                type: 'asset',
                fileName: file,
                source: template.replace('%%tests%%', code),
            })
        },
    }
}

/** @type {import('rollup').RollupOptions} */
export default [
    {
        input: 'tests',
        output: {
            file: 'test/browser.html',
            format: 'iife',
            sourcemap: true,
            globals: {
                chai: 'chai',
                mocha: 'mocha',
            },
        },
        external: ['chai', 'mocha'],
        plugins: [
            virtual({
                tests: testFiles.map((f) => `import '${f.slice(0, -3)}'`).join('\n'),
            }),
            replace({
                preventAssignment: true,
                'process.env.BUOY_URL': JSON.stringify(process.env.BUOY_URL),
            }),
            alias({
                entries: [{find: '$lib', replacement: '../src'}],
            }),
            typescript({target: 'es6', module: 'esnext', tsconfig: './test/tsconfig.json'}),
            resolve({browser: true, preferBuiltins: false}),
            commonjs(),
            json(),
            inline(),
        ],
    },
]
