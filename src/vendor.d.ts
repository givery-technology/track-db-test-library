declare module 'csvjson' {
  export function toCSV(data: any[], options?: any): string;
  export function toObject(data: string, options?: any): any[];
  export function toSchemaObject(data: string, options?: any): any[];
}

declare module 'eaw' {
  export function getWidth(str: any): number;
  export function isNarrowCharacter(str: any): boolean;
}

declare module 'docopt' {
  export function docopt(doc: string, options?: any): any;
}

declare module 'diff-match-patch' {
  class DiffMatchPatch {
    Diff_EditCost: number;
    diff_linesToChars_(text1: string, text2: string): { chars1: string; chars2: string; lineArray: string[] };
    diff_main(text1: string, text2: string, checklines: boolean): any[];
    diff_charsToLines_(diffs: any[], lineArray: string[]): void;
  }
  export = DiffMatchPatch;
}

declare module 'yaml' {
  export function parse(str: string): any;
  export function stringify(obj: any): string;
}
