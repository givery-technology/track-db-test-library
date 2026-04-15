export declare function normalize(xs: any): any[];
export declare function diff(as: any[], bs: any[]): {
    a: Map<number, string[]>;
    b: Map<number, string[]>;
};
export declare function format(records: any[], option?: {
    offset?: number;
    limit?: number;
    diff?: Map<number, string[]>;
    success?: boolean;
}): string;
export declare function toCSV(records: any[]): string;
