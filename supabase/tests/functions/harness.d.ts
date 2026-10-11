// deno-lint-ignore-file no-explicit-any
export function freshDb(opts?: { seed?: boolean }): Promise<any>;
export function makeAdmin(t: any, email?: string): Promise<string>;
export function plan(t: any, code: string): Promise<string>;
