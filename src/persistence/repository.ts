// Browser delegation is separated from the worker's local database path so
// bundling the persistence worker never recursively bundles its own client.
export { SaveDatabase, type Lease } from './localRepository';
export { SaveRepository } from './browserRepository';
