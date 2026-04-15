export declare const text: (strings: TemplateStringsArray | string, ...values: any[]) => string;
export { add, message };
declare function add(target: string | Record<string, string> | undefined): void;
declare function message(msg: string | Record<string, string> | undefined): string | undefined;
