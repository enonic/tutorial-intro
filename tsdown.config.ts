import {globSync} from 'glob';
import {defineConfig} from 'tsdown';
import {transform} from '@swc/core';


const SRC = 'src/main/resources';
const SRC_ASSETS = `${SRC}/assets`;
const DST = 'build/resources/main';
const DST_ASSETS = `${DST}/assets`;

const dev = process.env.NODE_ENV === 'development';
const logLevel: 'silent' | 'info' = ['QUIET', 'WARN'].includes(process.env.LOG_LEVEL_FROM_GRADLE || '') ? 'silent' : 'info';

// Enonic XP loads each controller/service/task by its resource path, so every
// source file must become its own output file with the directory tree intact.
function entries(dir: string, exts: string, ignore: string[] = []): Record<string, string> {
    return Object.fromEntries(
        globSync(`${dir}/**/*.${exts}`, {posix: true, ignore})
            .map(file => [file.slice(dir.length + 1).replace(/\.[^.]+$/, ''), file]),
    );
}

const serverEntry = entries(SRC, '{ts,js}', [`${SRC_ASSETS}/**`]);
const assetEntry = entries(SRC_ASSETS, '{tsx,ts,jsx,js}');

// XP runtime libraries are provided by the platform — never bundle them.
const xpExternal = [
    '/lib/enonic/asset',
    '/lib/thymeleaf',
    /^\/lib\/xp\//,
];

// Nashorn (XP's server-side JS engine) lacks ES2015 destructuring, but Oxc —
// tsdown's transformer — can't target below es2015. Re-lower the bundled server
// output to es5 with SWC after bundling, so force-bundled deps are covered too.
const nashornEs5 = {
    name: 'nashorn-es5',
    async renderChunk(code: string) {
        const out = await transform(code, {
            jsc: {
                parser: {syntax: 'ecmascript'},
                target: 'es5',
                loose: true,
                externalHelpers: false,
            },
            isModule: false,
            minify: false,
            sourceMaps: false,
        });
        return {code: out.code, map: null};
    },
};

export default defineConfig([
    ...(Object.keys(serverEntry).length ? [{
        entry: serverEntry,
        outDir: DST,
        format: 'cjs' as const,
        target: 'es2015',
        platform: 'neutral' as const,
        clean: false,
        dts: false,
        minify: false,
        sourcemap: false,
        logLevel,
        plugins: [nashornEs5],
        tsconfig: `${SRC}/tsconfig.json`,
        inputOptions: {
            external: xpExternal,
            resolve: {
                mainFields: ['module', 'main'],
            },
        },
        outputOptions: {
            // XP loads server scripts by their `.js` resource path (e.g. main.js,
            // /lib/info.js from site.yaml). Rolldown defaults CJS entries to `.cjs`,
            // which XP never runs — force `.js` so the entry point and controllers load.
            entryFileNames: '[name].js',
            chunkFileNames: '_chunks/[name]-[hash].js',
        },
    }] : []),
    ...(Object.keys(assetEntry).length ? [{
        entry: assetEntry,
        outDir: DST_ASSETS,
        format: 'esm' as const,
        target: 'es2015',
        platform: 'browser' as const,
        clean: false,
        dts: false,
        minify: !dev,
        sourcemap: !dev,
        logLevel,
        tsconfig: `${SRC_ASSETS}/tsconfig.json`,
    }] : []),
]);
