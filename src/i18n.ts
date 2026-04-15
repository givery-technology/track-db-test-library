import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import buildin from './i18n-buildin';

const lang = process.env.CHALLENGE_LANGUAGE || 'ja';
let langMap: Record<string, string> = {};
add(buildin[lang]);
add(`locale/${lang}.yml`);

export const text: (strings: TemplateStringsArray | string, ...values: any[]) => string = tagify(getLangMap);
export { add, message };

function getLangMap(t: string): string {
  const candidate = langMap[t];
  return typeof candidate === 'undefined' ? t : candidate;
}

function tagify(fn: (s: string) => string): (strings: TemplateStringsArray | string, ...values: any[]) => string {
  return function(strings: any, ...values: any[]): string {
    if (typeOf(strings) === 'string') {
      return fn(strings);
    } else {
      return String.raw(
        { raw: (strings as TemplateStringsArray).raw.map((s: string) => fn(s)) },
        ...values.map((s: any) => fn(s))
      );
    }
  };
}

function loadFromFile(path: string): Record<string, string> {
  try {
    return parseYaml(fs.readFileSync(path, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function add(target: string | Record<string, string> | undefined): void {
  switch (typeOf(target)) {
    case 'string':
      Object.assign(langMap, loadFromFile(target as string));
      break;
    case 'object':
      Object.assign(langMap, target);
      break;
  }
}

function typeOf(x: any): string {
  return Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
}

function message(msg: string | Record<string, string> | undefined): string | undefined {
  if (!!msg) {
    if (typeof msg === 'string') {
      return getLangMap(msg);
    } else {
      const m = msg[lang];
      return !!m ? m : Object.values(msg)[0];
    }
  }
  return undefined;
}
