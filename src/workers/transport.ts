// Large worlds are delivered in bounded messages. Both sender and receiver yield
// between batches, instead of cloning a 40–100 MB graph in a single UI task.
import { CONFIG } from '../engine/config';
type Endpoint = { postMessage(message: unknown): void };
type Path = string[];
type Patch = [Path, unknown];
type Packet = {
  __ptgTransport: 1;
  id: number;
  kind: 'start' | 'chunk' | 'end';
  patches?: Patch[];
};
let sequence = 0;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isWorld = (value: Record<string, unknown>) =>
  typeof value.seed === 'string' &&
  isObject(value.players) &&
  isObject(value.clubs) &&
  isObject(value.leagues);
function* record(value: Record<string, unknown>, path: Path): Generator<Patch> {
  yield [path, {}];
  for (const key of Object.keys(value)) yield [[...path, key], value[key]];
}
function* patches(value: unknown, path: Path = []): Generator<Patch> {
  if (Array.isArray(value)) {
    yield [path, []];
    for (let index = 0; index < value.length; index++)
      yield* patches(value[index], [...path, String(index)]);
  } else if (isObject(value)) {
    yield [path, {}];
    if (isWorld(value)) {
      for (const key of Object.keys(value)) {
        const item = value[key],
          location = [...path, key];
        if (key === 'pyramid' && isObject(item)) {
          yield [location, {}];
          for (const part of Object.keys(item)) {
            const content = item[part];
            if (isObject(content)) yield* record(content, [...location, part]);
            else yield [[...location, part], content];
          }
        } else if (isObject(item)) yield* record(item, location);
        else if (Array.isArray(item)) {
          yield [location, []];
          for (let index = 0; index < item.length; index++)
            yield [[...location, String(index)], item[index]];
        } else yield [location, item];
      }
    } else {
      for (const key of Object.keys(value)) yield* patches(value[key], [...path, key]);
    }
  } else yield [path, value];
}
export async function sendChunked(
  endpoint: Endpoint,
  message: unknown,
  cancelled: () => boolean = () => false,
): Promise<void> {
  const id = ++sequence;
  endpoint.postMessage({ __ptgTransport: 1, id, kind: 'start' } satisfies Packet);
  let batch: Patch[] = [],
    started = performance.now();
  for (const patch of patches(message)) {
    if (cancelled()) return;
    batch.push(patch);
    if (batch.length < CONFIG.workers.transportBatchEntries) continue;
    endpoint.postMessage({ __ptgTransport: 1, id, kind: 'chunk', patches: batch } satisfies Packet);
    batch = [];
    if (performance.now() - started >= CONFIG.workers.transportYieldMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      started = performance.now();
    }
  }
  if (cancelled()) return;
  if (batch.length)
    endpoint.postMessage({ __ptgTransport: 1, id, kind: 'chunk', patches: batch } satisfies Packet);
  endpoint.postMessage({ __ptgTransport: 1, id, kind: 'end' } satisfies Packet);
}
export function createChunkReceiver<T>(
  callback: (message: T) => void,
): (event: { data: unknown }) => void {
  const pending = new Map<number, unknown>();
  return ({ data }) => {
    if (!isObject(data) || data.__ptgTransport !== 1) {
      callback(data as T);
      return;
    }
    const packet = data as unknown as Packet;
    if (packet.kind === 'start') {
      pending.set(packet.id, undefined);
      return;
    }
    if (!pending.has(packet.id)) return;
    if (packet.kind === 'end') {
      const message = pending.get(packet.id);
      pending.delete(packet.id);
      callback(message as T);
      return;
    }
    for (const [path, value] of packet.patches ?? []) {
      if (!path.length) {
        pending.set(packet.id, value);
        continue;
      }
      let target = pending.get(packet.id) as Record<string, unknown>;
      for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
      Object.defineProperty(target, path.at(-1)!, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  };
}
