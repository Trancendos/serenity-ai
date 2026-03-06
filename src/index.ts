/**
 * Serenity AI — Entry Point
 *
 * Agent wellness monitoring, check-ins, flags, support tickets,
 * and wellness resources for the Trancendos mesh.
 * Zero-cost compliant — no LLM calls.
 *
 * Port: 3025
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { app, wellness } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3025);
const HOST = process.env.HOST ?? '0.0.0.0';

// ── Startup ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('Serenity AI starting up...');

  const server = app.listen(PORT, HOST, () => {
    logger.info(
      { port: PORT, host: HOST, env: process.env.NODE_ENV ?? 'development' },
      '🌿 Serenity AI is online — Wellness monitoring active',
    );
  });

  // ── Periodic Wellness Summary (every 20 minutes) ─────────────────────────
  const WELLNESS_INTERVAL = Number(process.env.WELLNESS_INTERVAL_MS ?? 20 * 60 * 1000);
  const wellnessTimer = setInterval(() => {
    try {
      const summary = wellness.getSummary();
      logger.info(
        {
          overallStatus: summary.overallStatus,
          totalAgents: summary.totalAgents,
          optimalAgents: summary.optimalAgents,
          goodAgents: summary.goodAgents,
          fairAgents: summary.fairAgents,
          stressedAgents: summary.stressedAgents,
          criticalAgents: summary.criticalAgents,
          openTickets: summary.openTickets,
          unresolvedFlags: summary.unresolvedFlags,
          averageWellnessScore: summary.averageWellnessScore.toFixed(1),
        },
        '🌿 Serenity periodic wellness summary',
      );

      if (summary.criticalAgents > 0) {
        logger.warn(
          { criticalAgents: summary.criticalAgents, agentsNeedingAttention: summary.agentsNeedingAttention },
          '⚠️  Critical agent wellness detected — immediate attention required',
        );
      }
    } catch (err) {
      logger.error({ err }, 'Periodic wellness summary failed');
    }
  }, WELLNESS_INTERVAL);

  // ── Graceful Shutdown ────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(wellnessTimer);
    server.close(() => {
      logger.info('Serenity AI shut down cleanly');
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Bootstrap failed');
  process.exit(1);
});