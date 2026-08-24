declare module 'passport-jwt' {
  import { Request } from 'express';

  export type VerifiedCallback = (
    error: unknown,
    user?: unknown,
    info?: unknown,
  ) => void;

  export type JwtFromRequestFunction = (request: Request) => string | null;

  export const ExtractJwt: {
    fromAuthHeaderAsBearerToken(): JwtFromRequestFunction;
  };

  export class Strategy {
    constructor(options: {
      jwtFromRequest: JwtFromRequestFunction;
      secretOrKey: string;
      ignoreExpiration?: boolean;
    });
  }
}
