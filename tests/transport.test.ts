import { describe, expect, it } from 'vitest';
import { createChunkReceiver, sendChunked } from '../src/workers/transport';

describe('bounded worker transport', () => {
  it('reassembles interleaved worlds, lists and arrays without a full graph message', async () => {
    const world = {
      seed: 'transport',
      clubs: {},
      leagues: {},
      players: Object.fromEntries(
        Array.from({ length: 1000 }, (_, index) => [
          `player:${index}`,
          { id: index, attributes: [1, 2, 3] },
        ]),
      ),
      events: [null, 3],
      pyramid: { ties: {}, phases: {} },
    };
    const messages: unknown[] = [],
      packets: unknown[] = [];
    const receive = createChunkReceiver((message) => messages.push(message));
    const endpoint = {
      postMessage: (message: unknown) => {
        packets.push(message);
        receive({ data: structuredClone(message) });
      },
    };
    await Promise.all([
      sendChunked(endpoint, { world }),
      sendChunked(endpoint, [{ payload: { world } }, undefined]),
    ]);
    expect(messages).toEqual(
      expect.arrayContaining([{ world }, [{ payload: { world } }, undefined]]),
    );
    expect(packets.length).toBeGreaterThan(50);
    for (const packet of packets as { patches?: unknown[] }[])
      expect(packet.patches?.length ?? 0).toBeLessThanOrEqual(32);
  });
  it('splits wide records inside the world, so no message carries one whole', async () => {
    const many = (count: number) =>
      Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`player:${index}`, { id: index, goals: 2 }]),
      );
    const world = {
      seed: 'wide',
      clubs: {},
      leagues: {},
      players: {},
      archive: { players: many(500) },
      seasonStats: { competitions: { league: many(300) }, version: 1 },
    };
    let result: unknown;
    const largest: number[] = [];
    const receive = createChunkReceiver((message) => {
      result = message;
    });
    await sendChunked(
      {
        postMessage: (data) => {
          for (const [, value] of (data as { patches?: [string[], unknown][] }).patches ?? [])
            largest.push(JSON.stringify(value)?.length ?? 0);
          receive({ data: structuredClone(data) });
        },
      },
      { world },
    );
    expect(result).toEqual({ world });
    // One archived player at most, never the archive.
    expect(Math.max(...largest)).toBeLessThan(100);
  });
  it('cancels a pending transfer without emitting a partial application message', async () => {
    let cancelled = false;
    const received: unknown[] = [];
    const receive = createChunkReceiver((message) => received.push(message));
    await sendChunked(
      {
        postMessage: (data) => {
          receive({ data });
          cancelled = true;
        },
      },
      { world: { seed: 'cancel', clubs: {}, leagues: {}, players: {} } },
      () => cancelled,
    );
    expect(received).toEqual([]);
  });
  it('retains inert prototype-named keys without assigning object prototypes', async () => {
    const source: unknown = JSON.parse('{"__proto__":{"changed":true},"constructor":"value"}');
    let result: unknown;
    const receive = createChunkReceiver((message) => {
      result = message;
    });
    await sendChunked({ postMessage: (data) => receive({ data }) }, source);
    expect(result).toEqual(source);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).changed).toBeUndefined();
  });
});
