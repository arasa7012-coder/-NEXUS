/**
 * @nexus/contracts — the promise between the API and the mobile app.
 *
 * Zero runtime dependencies, so the same module loads in Node and in Hermes.
 * If a shape is not defined here, it must not cross the wire.
 */
export * from "./validate.ts";
export * from "./common.ts";
export * from "./domain.ts";
