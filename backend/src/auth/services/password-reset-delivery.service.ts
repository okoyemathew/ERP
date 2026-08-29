import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetChannel } from '@prisma/client';

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
    return Boolean(this.getWebhookUrl(channel));
  }

  canDeliver(channel: PasswordResetChannel, destination?: string | null): boolean {
    if (!destination) return false;
    return this.hasConfiguredChannel(channel) || !this.isProduction();
  }

  async deliver(payload: DeliveryPayload): Promise<DeliveryResult> {
    const webhookUrl = this.getWebhookUrl(payload.channel);

    if (webhookUrl) {
      await this.sendWebhook(webhookUrl, payload);
      return { delivered: true };
    }

    if (!this.isProduction()) {
      return { delivered: true, devToken: payload.token };
    }

    throw new ServiceUnavailableException(
      'Password reset delivery is not configured',
    );
  }

  private getWebhookUrl(channel: PasswordResetChannel): string | undefined {
    return channel === PasswordResetChannel.EMAIL
      ? this.configService.get<string>('PASSWORD_RESET_EMAIL_WEBHOOK_URL')
      : this.configService.get<string>('PASSWORD_RESET_SMS_WEBHOOK_URL');
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
}
