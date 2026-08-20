import { he, type TranslationKey } from './he';

type Params = Record<string, string | number>;

/** Look up Hebrew copy, filling `{placeholders}`. */
export function t(key: TranslationKey, params?: Params): string {
  const template = he[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type { TranslationKey };
export { he };
