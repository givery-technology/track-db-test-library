declare global {
    namespace Chai {
        interface Assertion {
            fullscan(tables?: any, msg?: string): Assertion;
            recordEqual(val: any, msg?: string): Assertion;
            recordEqualToCsv(path: string, msg?: string): Assertion;
            recordContain(val: any, msg?: string): Assertion;
            columns(cols: any, msg?: string): Assertion;
            without(cols: any, msg?: string): Assertion;
            orderBy(cols: any): Assertion;
            asTable(table: string): Assertion;
        }
    }
}
export declare class TestRunner {
    lang: string;
    yaml: any;
    constructor(lang: string, yaml: string | any);
    runAll(): void;
    run(testcase: any): void;
    getTestcases(): Array<{
        title: string;
        fn: () => Promise<void>;
        timeout: number;
    }>;
}
export default TestRunner;
