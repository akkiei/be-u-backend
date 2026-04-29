import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, isNull, isNotNull, inArray, eq } from 'drizzle-orm';
import { firstValueFrom } from 'rxjs';
import * as schema from '../../database/schema';
import { scanHistory } from '../../database/schema/scan-history.schema';
import { ScansService } from './scans.service';

const BATCH_SIZE = 20;
const LLM_TEXT_LIMIT = 10_000;

type LabelResult = {
  product_type?: string;
  product_name?: string;
  brand?: string;
  usage_directions?: string;
  warnings?: string;
  confidence?: number;
  raw_issues?: string[];
};

type IngredientsResult = {
  product_type?: string;
  ingredients?: { name: string; purpose?: string; allergen?: boolean }[];
  allergens_summary?: string;
  confidence?: number;
  raw_issues?: string[];
};

@Injectable()
export class ScanRetryService {
  private readonly logger = new Logger(ScanRetryService.name);
  private isRunning = false;
  private isEmbeddingRunning = false;

  constructor(
    @Inject('DB') private db: NodePgDatabase<typeof schema>,
    private readonly httpService: HttpService,
    private readonly scansService: ScansService,
  ) {}

  // Runs every 3 hours — finds label/ingredients scans that have raw OCR text
  // but no llmSummary (client-side LLM failed or timed out) and backfills them.
  @Cron(CronExpression.EVERY_3_HOURS)
  async retryFailedSummaries() {
    if (this.isRunning) {
      this.logger.warn('Retry job already running, skipping this tick');
      return;
    }

    const llmUrl = process.env.LLM_SERVER_URL;
    if (!llmUrl) {
      this.logger.warn('LLM_SERVER_URL not set, skipping retry job');
      return;
    }

    this.isRunning = true;

    try {
      const pending = await this.db
        .select({
          id: scanHistory.id,
          userId: scanHistory.userId,
          scanType: scanHistory.scanType,
          rawOcrText: scanHistory.rawOcrText,
          parsedResult: scanHistory.parsedResult,
        })
        .from(scanHistory)
        .where(
          and(
            inArray(scanHistory.scanType, ['label', 'ingredients']),
            isNotNull(scanHistory.rawOcrText),
            isNull(scanHistory.llmSummary),
          ),
        )
        .limit(BATCH_SIZE);

      if (pending.length === 0) {
        this.logger.debug('LLM retry: no pending scans');
        return;
      }

      this.logger.log(`LLM retry: processing ${pending.length} scan(s)`);
      const baseUrl = llmUrl.trim();
      let successCount = 0;

      for (const scan of pending) {
        try {
          const [contextBlock, ragBlock] = await Promise.all([
            this.scansService.buildUserContextBlock(scan.userId),
            this.scansService
              .buildRagContextBlock(scan.userId, scan.rawOcrText as string, scan.id)
              .catch(() => ''),
          ]);
          const prefix = contextBlock + ragBlock;
          const budget = LLM_TEXT_LIMIT - prefix.length;
          const text = prefix + (scan.rawOcrText as string).slice(0, budget);
          const endpoint = `${baseUrl}/${scan.scanType}`; // /label or /ingredients

          const { data } = await firstValueFrom(
            this.httpService.post<Record<string, unknown>>(endpoint, { text }),
          );

          const { llmSummary, parsedUpdate } = this.extractResult(
            scan.scanType,
            data,
          );

          await this.db
            .update(scanHistory)
            .set({
              llmSummary,
              parsedResult: {
                ...(scan.parsedResult as Record<string, unknown>),
                ...parsedUpdate,
              },
              confidence:
                typeof data.confidence === 'number'
                  ? String(data.confidence)
                  : null,
            })
            .where(eq(scanHistory.id, scan.id));

          successCount++;
          this.logger.debug(
            `LLM retry ok: scan=${scan.id} type=${scan.scanType}`,
          );
        } catch (err) {
          this.logger.warn(
            `Retry failed: scan=${scan.id} — ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `LLM retry done: ${successCount}/${pending.length} succeeded`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  // Runs every hour — finds scans with text but no embedding and backfills them.
  @Cron(CronExpression.EVERY_HOUR)
  async retryFailedEmbeddings() {
    if (this.isEmbeddingRunning) {
      this.logger.warn('Embedding retry job already running, skipping this tick');
      return;
    }

    const embedUrl = process.env.EMBEDDING_SERVER_URL;
    if (!embedUrl) {
      this.logger.warn('EMBEDDING_SERVER_URL not set, skipping embedding retry');
      return;
    }

    this.isEmbeddingRunning = true;

    try {
      const pending = await this.db
        .select({
          id: scanHistory.id,
          scanType: scanHistory.scanType,
          rawOcrText: scanHistory.rawOcrText,
          llmSummary: scanHistory.llmSummary,
        })
        .from(scanHistory)
        .where(
          and(
            isNull(scanHistory.embedding),
            isNotNull(scanHistory.rawOcrText),
          ),
        )
        .limit(BATCH_SIZE);

      if (pending.length === 0) {
        this.logger.debug('Embedding retry: no pending scans');
        return;
      }

      this.logger.log(`Embedding retry: processing ${pending.length} scan(s)`);
      let successCount = 0;

      for (const scan of pending) {
        try {
          const embedText = (scan.llmSummary ?? scan.rawOcrText) as string;
          await this.scansService.generateAndStoreEmbedding(scan.id, embedText);
          successCount++;
          this.logger.debug(
            `Embedding retry ok: scan=${scan.id} type=${scan.scanType}`,
          );
        } catch (err) {
          this.logger.warn(
            `Embedding retry failed: scan=${scan.id} — ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `Embedding retry done: ${successCount}/${pending.length} succeeded`,
      );
    } finally {
      this.isEmbeddingRunning = false;
    }
  }

  private extractResult(
    scanType: string,
    data: Record<string, unknown>,
  ): { llmSummary: string | null; parsedUpdate: Record<string, unknown> } {
    if (scanType === 'label') {
      const d = data as LabelResult;
      return {
        // usage_directions is the closest thing to a human summary for a label
        llmSummary: d.usage_directions ?? null,
        parsedUpdate: {
          product_type: d.product_type,
          product_name: d.product_name,
          brand: d.brand,
          usage_directions: d.usage_directions,
          warnings: d.warnings,
          raw_issues: d.raw_issues,
        },
      };
    }

    if (scanType === 'ingredients') {
      const d = data as IngredientsResult;
      return {
        llmSummary: d.allergens_summary ?? null,
        parsedUpdate: {
          product_type: d.product_type,
          ingredients: d.ingredients,
          allergens_summary: d.allergens_summary,
          raw_issues: d.raw_issues,
        },
      };
    }

    return { llmSummary: null, parsedUpdate: data };
  }
}
