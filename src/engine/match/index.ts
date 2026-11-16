/**
 * The match engine's public surface (core.ts), with the decision chains loaded: the workers,
 * the career, persistence and the tests play whole matches synchronously. The match screen
 * imports core.ts and fetches the chains once it is up.
 */
import './chains';

export * from './core';
