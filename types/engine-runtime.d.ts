/**
 * The few runtime globals the engine may use (tsconfig.engine.json). Each exists, with these
 * signatures, in every place the engine runs: the page, Web Workers and Node 22+. Nothing
 * browser-only belongs here; the full app typecheck takes the real declarations from the DOM
 * lib, which this file must stay compatible with.
 */
declare function structuredClone<T>(value: T): T;
declare function atob(data: string): string;
declare function btoa(data: string): string;

interface TextEncoder {
  encode(input?: string): Uint8Array<ArrayBuffer>;
}
declare const TextEncoder: {
  prototype: TextEncoder;
  new (): TextEncoder;
};
interface TextDecoder {
  decode(input?: AllowSharedBufferSource): string;
}
declare const TextDecoder: {
  prototype: TextDecoder;
  new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }): TextDecoder;
};
type AllowSharedBufferSource = ArrayBufferLike | ArrayBufferView;
