declare module 'better-sqlite3' {
  export class Database {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): { run(...args: any[]): any; get(...args: any[]): any; all(...args: any[]): any[] };
  }
  export default Database;
}
