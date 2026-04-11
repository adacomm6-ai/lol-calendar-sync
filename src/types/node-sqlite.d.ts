declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string, options?: { readonly?: boolean });
    prepare(sql: string): {
      all(...params: any[]): any[];
      get(...params: any[]): any;
      run(...params: any[]): any;
    };
    close(): void;
  }
}
