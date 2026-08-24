import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthService, ValidatedLoginUser } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type { AuthenticatedUser } from './types/authenticated-user.type';

type RequestWithValidatedUser = Request & {
  user?: ValidatedLoginUser;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register-owner')
  registerOwner(
    @Body() registerOwnerDto: RegisterOwnerDto,
    @Req() request: Request,
  ) {
    return this.authService.registerOwner(registerOwnerDto, request);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Body() loginDto: LoginDto, @Req() request: RequestWithValidatedUser) {
    return this.authService.loginWithUser(
      request.user as ValidatedLoginUser,
      request,
      {
        deviceName: loginDto.deviceName,
        deviceId: loginDto.deviceId,
        deviceType: loginDto.deviceType,
      },
    );
  }

  @Public()
  @Post('refresh')
  refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() request: Request,
  ) {
    return this.authService.refreshToken(refreshTokenDto, request);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Req() request: Request,
  ) {
    return this.authService.requestPasswordReset(forgotPasswordDto, request);
  }

  @Public()
  @Post('reset-password')
  resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Req() request: Request,
  ) {
    return this.authService.resetPassword(resetPasswordDto, request);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.authService.logout(user, request);
  }

  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.authService.logoutAll(user, request);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUser(user);
  }

  @Get('permissions')
  permissions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUserPermissions(user);
  }

  @Patch('password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ) {
    return this.authService.changePassword(user, dto, request);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getSessions(user);
  }

  @Post('sessions/:id/revoke')
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Req() request: Request,
  ) {
    return this.authService.revokeSession(user, sessionId, request);
  }
}
