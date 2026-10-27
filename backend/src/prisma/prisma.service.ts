import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly performanceLogger = new Logger('PrismaPerformance');

  constructor() {
    super({
      log:
        process.env.PERFORMANCE_LOGGING === 'true'
          ? [{ emit: 'event', level: 'query' }]
          : [],
    });
    if (process.env.PERFORMANCE_LOGGING === 'true') {
      const slowQueryMs = Number(process.env.PERFORMANCE_SLOW_QUERY_MS ?? 250);
      const queryEventClient = this as unknown as {
        $on(
          event: 'query',
          listener: (event: { duration: number; target: string }) => void,
        ): void;
      };
      queryEventClient.$on('query', (event) => {
        if (event.duration >= slowQueryMs) {
          // Never log SQL or bound parameters; those can contain business data.
          this.performanceLogger.warn(
            JSON.stringify({
              kind: 'prisma_slow_query',
              durationMs: event.duration,
              target: event.target,
            }),
          );
        }
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
