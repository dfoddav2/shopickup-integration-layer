declare module 'drizzle-orm/better-sqlite3' {
  export function sqliteTable(name: string, cols: any): {
    $type: <T = any>() => {
      default: (v: any) => any;
    };
  };
  export function varchar(name: string, opts?: any): any;
  export function integer(name: string, opts?: any): any;
  export function text(name: string, opts?: any): any;
  export function json(name: string, opts?: any): any;
}
