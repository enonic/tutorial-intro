# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`tutorial-intro` — the "Introduction to Enonic XP" tutorial application (`com.enonic.app.intro`). It is an Enonic XP 8 sample/demonstration
app that ships the Movie DB sample content and renders simple preview pages. Targets XP `8.0.2` (see `gradle.properties`). Not a
library/API-only app: it registers a site with controllers and content types, and auto-imports sample data on first install. The app is
built on the conventions of the `starter-ts` starter and mirrors the sibling `app-hmdb` reference app.

The accompanying tutorial text lives in `docs/` (AsciiDoc) and is published via the `enonic-docgen` workflow — it is the product, not
throwaway scaffolding. Keep it in sync when the app changes.

## Build & deploy

XP apps compile **through the connected sandbox**, not via the host JDK/Gradle. The Enonic CLI picks the sandbox from the `.enonic` file (
gitignored) and the sandbox provides the JDK + Gradle runtime used for the build — don't debug build errors by inspecting local
`java -version` or running `./gradlew` directly, and don't assume the host's Java matches what the build uses.

Primary commands:

- `enonic project build` — compile the app inside the connected sandbox.
- `enonic project deploy` — build and deploy the jar to the sandbox.
- `enonic project sandbox` — re-associate or switch the connected sandbox.

The server code is **TypeScript**, compiled to `build/resources/main` by `tsdown` (config: `tsdown.config.ts`, one output `.js` per source
file with the tree intact). Gradle drives npm via the `com.github.node-gradle.node` plugin: `npmBuild` (→ `jar`) runs `npm run build`, and
`npmCheck` (→ `check`) runs `tsc --noEmit` + ESLint. `processResources` excludes `*.ts`/`*.tsx`/`*.json`/`.gitkeep` so only the compiled
`.js` plus the copied descriptors land in the jar. You can run the toolchain directly (no sandbox needed) from the repo root: `npm install`,
then `npm run check` / `npm run build`.

Type definitions come from `@enonic-types/*` (dev-only); `/lib/enonic/asset` types come from `@enonic-types/lib-asset`, and `/lib/thymeleaf`
types from `@item-enonic-types/lib-thymeleaf`. No test framework is currently wired. CI runs under `.github/workflows/build.yml`, and
`.github/workflows/enonic-docgen.yml` regenerates the tutorial docs.

## First-boot bootstrapping

`src/main/resources/main.ts` is the application entry point. On the cluster leader (`clusterLib.isLeader()`) it:

1. Runs in an admin context on repo `com.enonic.cms.intro`.
2. If the `intro` project does not exist, creates it via `lib-project` (`publicRead: true`, language `en`), connecting this app to the
   project with `siteConfig: [{ applicationKey: app.name }]` so the app's site/content-type schemas are available in the project and the
   imported content resolves against them. Dropping this link leaves the imported content referencing content types the project doesn't
   know about.
3. Imports `/import` into `/content` using `exportLib.importNodes`, applying `import/replace_app.xsl` with `applicationId=app.name` and
   `projectName=intro` so the exported XML's old app name and `role:cms.project.*` principals are rewritten to the currently-deployed
   app/project on import.
4. Publishes the top-level content roots `/movies`, `/persons`, `/articles`, and `/playlists` to `master`. In XP8 `contentLib.publish`
   takes no source/target branch — it publishes from the current context branch (`draft`, set in `runInContext`) to `master`.

The import only runs when the project is **absent**. If the `intro` project already exists in the sandbox, redeploying logs "Project intro
exists, skipping import" at `debug` level — delete the project/layer (or reset the sandbox) to re-bootstrap with fresh sample data.

If you change `appName` in `gradle.properties` the XSLT substitution is what keeps imported content referring to the right app. Don't bypass
it by hardcoding app IDs in the exported data.

## Resource layout (XP8)

Under `src/main/resources/`:

- `application.yaml` — top-level app manifest (`kind: "Application"`, title, description, vendor).
- `cms/` — all schemas the CMS cares about:
    - `site.yaml` — portal mappings (controllers matched by content type) and mounted Universal APIs (`apis:`, e.g. `asset`).
    - `cms.yaml` — app-level mixin bindings (which content types get which mixin fields).
    - `content-types/`, `pages/`, `parts/`, `layouts/`, `macros/`, `mixins/`, `styles/` — all YAML descriptors.
- `main.ts` — application entry point (see First-boot bootstrapping).
- `lib/` — portal controllers (TypeScript) registered via `cms/site.yaml` mappings:
    - `info.ts` — matches `type:'portal:site'`, plain HTML landing page.
    - `preview.ts` — matches `type:'(?!media:).*'` (every non-media type), uses `lib-thymeleaf` to render `preview.html` (a copied resource,
      not compiled).
- `i18n/` — translation bundles (`phrases.properties`, `phrases_no.properties`). Must live at `/i18n/`, not `/site/i18n/` (XP8 removed the
  site-scoped lookup).
- `assets/` — static assets (`styles.css`). Served by `lib-asset`'s bundled **Asset API** (`assetUrl` is imported from `/lib/enonic/asset`,
  not `/lib/xp/portal`). The app mounts it by listing `asset` under `apis:` in `cms/site.yaml` (XP8 Universal APIs are not exposed by
  default).
- `import/` — XP content export used for first-boot bootstrapping (`movies/`, `persons/`, `articles/`, `playlists/`), with
  `replace_app.xsl` at its root rewriting app IDs and project-role principals on import.

Controllers are authored in TypeScript and compiled to `.js`, so the controller names in `cms/site.yaml` (e.g. `/lib/info.js`) are the *
*compiled** output paths. Use named uppercase HTTP-method exports — `export function GET(req)` / `POST` (compiled to `exports.GET`) — XP8
deprecated lowercase method names.

## Working conventions specific to XP apps

- Resources under `src/main/resources/` are served as classpath resources by XP; the `/lib/...` paths in controller `import` statements (and
  `resolve('...')` calls) are classpath-relative, not filesystem-relative. tsdown compiles the ESM `import`s to CommonJS and keeps the
  `/lib/xp/*`, `/lib/enonic/asset` and `/lib/thymeleaf` references external (provided by the platform at runtime).
- Library deps in `build.gradle` use the `xplibs.*` catalog (e.g. `include xplibs.content`), not version-pinned coordinates. Third-party
  libs like `lib-asset` and `lib-thymeleaf` still use explicit coordinates.
- `include` vs `implementation` in `build.gradle`: `include` bundles the library inside the deployed app jar (used for `lib-xp:*` runtime
  libs and third-party `lib-*` deps), `implementation` is a compile-time-only XP API. Keep that distinction when adding dependencies.
- Mixin bindings are split: mixin schemas live in `cms/mixins/<name>/<name>.yaml`, and the binding of "which content types get this mixin"
  lives in `cms/cms.yaml` under `mixins:` (with an `allowContentTypes` regex). Site mappings live separately in `cms/site.yaml`.

## TypeScript build configs

- Root `tsconfig.json` configures the build tooling only (`tsdown.config.ts`); it excludes `src/`.
- `src/main/resources/tsconfig.json` is the server config: `paths` map `/lib/xp/*` → `@enonic-types/lib-*`, `/lib/enonic/asset` →
  `@enonic-types/lib-asset`, `/lib/*` → `@item-enonic-types/lib-*`, and `/*` → app-local resources. `@enonic-types/global` provides the
  runtime globals (`app`, `log`, `resolve`, `__`).
