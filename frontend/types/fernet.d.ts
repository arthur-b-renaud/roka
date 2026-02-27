declare module "fernet" {
  export class Secret {
    constructor(key: string);
  }
  export class Token {
    constructor(opts: { secret: Secret; token?: string; ttl?: number });
    encode(message: string): string;
    decode(): string;
  }
}
