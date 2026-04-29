import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { lt, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from '../../database/schema';
import { logs } from '../../database/schema/logs.schema';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

@Injectable()
export class DbLoggerService implements LoggerService {
  constructor(
    @Inject('DB') private readonly db: NodePgDatabase<typeof schema>,
  ) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  log(message: unknown, context?: string) {
    const msg = this.stringify(message);
    console.log(`[LOG] [${context ?? ''}] ${msg}`);
    this.writeToFile('LOG', msg, context);
  }

  warn(message: unknown, context?: string) {
    const msg = this.stringify(message);
    console.warn(`[WARN] [${context ?? ''}] ${msg}`);
    this.writeToFile('WARN', msg, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    const msg = this.stringify(message);
    console.error(`[ERROR] [${context ?? ''}] ${msg}`, trace ?? '');
    this.writeToFile('ERROR', msg, context, trace);
    this.persistToDb(msg, context, trace ? { trace } : undefined);
  }

  debug(message: unknown, context?: string) {
    console.debug(`[DEBUG] [${context ?? ''}] ${this.stringify(message)}`);
  }

  verbose(message: unknown, context?: string) {
    console.log(`[VERBOSE] [${context ?? ''}] ${this.stringify(message)}`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeOldLogs(): Promise<void> {
    // Purge DB logs older than 7 days
    const result = await this.db
      .delete(logs)
      .where(lt(logs.createdAt, sql`NOW() - INTERVAL '7 days'`));
    console.log(
      `[DbLogger] Purged ${result.rowCount ?? 0} DB log(s) older than 7 days`,
    );

    // Purge log files older than 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(LOG_DIR)) {
      const filePath = path.join(LOG_DIR, file);
      const { mtimeMs } = fs.statSync(filePath);
      if (mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        console.log(`[DbLogger] Deleted old log file: ${file}`);
      }
    }
  }

  private writeToFile(
    level: string,
    message: string,
    context?: string,
    trace?: string,
  ): void {
    try {
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const filePath = path.join(LOG_DIR, `app-${date}.log`);
      const timestamp = new Date().toISOString();
      const ctx = context ? `[${context}]` : '';
      let line = `${timestamp} [${level}] ${ctx} ${message}\n`;
      if (trace) line += `${trace}\n`;
      fs.appendFileSync(filePath, line);
    } catch {
      // never let file I/O break the app
    }
  }

  private persistToDb(
    message: string,
    context?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.db
      .insert(logs)
      .values({ level: 'error', context: context ?? null, message, metadata })
      .catch((err: Error) =>
        console.error(`[DbLogger] Failed to persist error log: ${err.message}`),
      );
  }

  private stringify(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
}
