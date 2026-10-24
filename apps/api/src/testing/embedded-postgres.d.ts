declare module 'embedded-postgres' {
  export default class EmbeddedPostgres {
    constructor(opts: Record<string, unknown>);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
  }
}
