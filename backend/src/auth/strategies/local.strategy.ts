import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-local';
import { AuthService, ValidatedLoginUser } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'emailOrPhone',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(
    request: Request,
    emailOrPhone: string,
    password: string,
  ): Promise<ValidatedLoginUser> {
    const user = await this.authService.validateUser(
      emailOrPhone,
      password,
      request,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }
}
