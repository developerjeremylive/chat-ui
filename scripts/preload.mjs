// Preload for the production build (node build): vite inlines the CJS copy of
// mongodb-memory-server-core into the SSR bundle, which keeps a bare `__dirname`
// reference when it spawns its child "killer" process (MongoInstance._launchKiller).
// ESM module scope has no __dirname, so this preload exposes it globally, pointing
// at the package's lib/util dir so `../../scripts/mongo_killer.js` resolves.
// Usage: node --import ./scripts/preload.mjs --env-file=.env build
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const libUtilDir = path.join(path.dirname(require.resolve("mongodb-memory-server-core/package.json")), "lib", "util");

if (existsSync(path.resolve(libUtilDir, "../../scripts/mongo_killer.js"))) {
	globalThis.__dirname = libUtilDir;
	globalThis.__filename = path.join(libUtilDir, "index.js");
} else {
	console.warn("[preload] mongo_killer.js not found; __dirname shim not applied");
}