export declare const SQL_ERROR: {
    readonly CHECK: "check";
    readonly NOT_NULL: "not_null";
    readonly UNIQUE: "unique";
    readonly FOREIGN_KEY: "foreign_key";
    readonly UNKNOWN: "unknown";
};
export declare function parseSQL(sqls: string): string[];
/**
 * Handles connection
 */
export declare class Connection {
    static util: {
        parseSQL: typeof parseSQL;
    };
    static SQL_ERROR: {
        readonly CHECK: "check";
        readonly NOT_NULL: "not_null";
        readonly UNIQUE: "unique";
        readonly FOREIGN_KEY: "foreign_key";
        readonly UNKNOWN: "unknown";
    };
    private _conn;
    private _cassette;
    private _options;
    static timeout(client: string | undefined, extra?: number): number;
    static new(options?: any): Promise<Connection>;
    constructor(conn: any, casette?: any, options?: any);
    get casette(): any;
    get conn(): any;
    destroy(): void;
    private _initLegacy;
    queryAll(queries: string[]): Promise<any[]>;
    prepare(queries: any): Promise<any>;
    get knex(): any;
    close(): Promise<void>;
    query(sql: string, opt_args?: any): Promise<any[]>;
    queryPlan(sql: string, opt_args?: any): Promise<any[]>;
    queryFromFile(path: string, opt_args?: any): Promise<any[]>;
    queryPlanFromFile(path: string, opt_args?: any[]): Promise<any[]>;
    loadFromCSV(path: string, table: string): Promise<any[]>;
    dryrun(fn: (conn: Connection) => Promise<any>): Promise<any>;
    tableSchema(table: string): Promise<any[]>;
    updateAutoIncrement(table: string, column: string, count: number): Promise<any>;
    lastValue(table: string, idCol: string): Promise<any[]>;
    errorOf(e: any): any;
}
export default Connection;
