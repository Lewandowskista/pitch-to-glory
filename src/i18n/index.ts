import { en } from './en';
export { en as t };
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(params[key] ?? match));
}
export function errorText(code: string): string {
  return en.errors[code as keyof typeof en.errors] ?? en.errors.storage;
}
