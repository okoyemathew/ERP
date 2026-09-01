import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetChannel } from '@prisma/client';
import { Resend } from 'resend';

type DeliveryPayload = {
  channel: PasswordResetChannel;
  destination: string;
  token: string;
  expiresAt: Date;
};

type DeliveryResult = {
  delivered: boolean;
  devToken?: string;
};

@Injectable()
export class PasswordResetDeliveryService {
  constructor(private readonly configService: ConfigService) {}

  hasConfiguredDelivery(): boolean {
    return (
      this.hasConfiguredChannel(PasswordResetChannel.EMAIL) ||
      this.hasConfiguredChannel(PasswordResetChannel.SMS)
    );
  }

  hasConfiguredChannel(channel: PasswordResetChannel): boolean {
    if (channel === PasswordResetChannel.EMAIL) {
      return Boolean(this.getResendApiKey() && this.getPasswordResetFromEmail());
    }

    return Boolean(this.getSmsWebhookUrl());
  }

  canDeliver(channel: PasswordResetChannel, destination?: string | null): boolean {
    if (!destination) return false;
    return this.hasConfiguredChannel(channel) || !this.isProduction();
  }

  async deliver(payload: DeliveryPayload): Promise<DeliveryResult> {
    if (payload.channel === PasswordResetChannel.EMAIL) {
      if (this.hasConfiguredChannel(PasswordResetChannel.EMAIL)) {
        await this.sendResendEmail(payload);
        return { delivered: true };
      }

      if (!this.isProduction()) {
        return { delivered: true, devToken: payload.token };
      }

      throw new ServiceUnavailableException(
        'Password reset email delivery is not configured',
      );
    }

    const smsWebhookUrl = this.getSmsWebhookUrl();

    if (smsWebhookUrl) {
      await this.sendWebhook(smsWebhookUrl, payload);
      return { delivered: true };
    }

    if (!this.isProduction()) {
      return { delivered: true, devToken: payload.token };
    }

    throw new ServiceUnavailableException(
      'Password reset delivery is not configured',
    );
  }

  private getResendApiKey(): string | undefined {
    return this.configService.get<string>('RESEND_API_KEY')?.trim() || undefined;
  }

  private getPasswordResetFromEmail(): string | undefined {
    return (
      this.configService.get<string>('PASSWORD_RESET_FROM_EMAIL')?.trim() ||
      undefined
    );
  }

  private getSmsWebhookUrl(): string | undefined {
    return (
      this.configService.get<string>('PASSWORD_RESET_SMS_WEBHOOK_URL')?.trim() ||
      undefined
    );
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private async sendWebhook(
    webhookUrl: string,
    payload: DeliveryPayload,
  ): Promise<void> {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: payload.channel,
        to: payload.destination,
        token: payload.token,
        expiresAt: payload.expiresAt.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Password reset delivery failed');
    }
  }

  private async sendResendEmail(payload: DeliveryPayload): Promise<void> {
    const apiKey = this.getResendApiKey();
    const from = this.getPasswordResetFromEmail();

    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Password reset email delivery is not configured',
      );
    }

    const resend = new Resend(apiKey);
    const expiresAt = payload.expiresAt.toISOString();
    const { error } = await resend.emails.send({
      from,
      to: [payload.destination],
      subject: 'Smart POS password reset code',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2>Smart POS password reset</h2>
          <p>We received a request to reset your Smart POS password.</p>
          <p>Your reset code is:</p>
          <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${payload.token}</p>
          <p>This code expires at ${expiresAt}.</p>
          <p>Open the Smart POS app, go to Reset Password, and enter this code with your new password.</p>
          <p>If you did not request this reset, you can ignore this email.</p>
        </div>
      `,
      text: [
        'Smart POS password reset',
        '',
        'We received a request to reset your Smart POS password.',
        `Your reset code is: ${payload.token}`,
        `This code expires at ${expiresAt}.`,
        'Open the Smart POS app, go to Reset Password, and enter this code with your new password.',
        'If you did not request this reset, you can ignore this email.',
      ].join('\n'),
    });

    if (error) {
      throw new ServiceUnavailableException('Password reset email failed');
    }
  }
}
