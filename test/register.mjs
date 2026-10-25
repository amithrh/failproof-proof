import { registerHooks } from "node:module";
const shim = new URL("./shim.mjs", import.meta.url).href;
registerHooks({
  resolve: (specifier, context, next) => (specifier === "failproofai" ? { url: shim, shortCircuit: true } : next(specifier, context)),
});
