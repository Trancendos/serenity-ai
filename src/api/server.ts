/**
 * Serenity AI — REST API Server
 *
 * Exposes agent wellness monitoring, check-ins, flags, support tickets,
 * and wellness resources endpoints for the Trancendos mesh.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import {
  WellnessEngine,
  SupportCategory,
  WellnessStatus,
  ResourceType,
} from '../wellness/wellness-engine';
import { logger } from '../utils/logger';


// ============================================================================
// IAM MIDDLEWARE — Trancendos 2060 Standard (TRN-PROD-001)
// ============================================================================
import { createHash, createHmac } from 'crypto';

const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const IAM_ALGORITHM = process.env.JWT_ALGORITHM || 'HS512';
const SERVICE_ID = 'serenity';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'serenity.agent.local';

function sha512Audit(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64 + '='.repeat((4 - b64.length % 4) % 4), 'base64').toString('utf8');
}

interface JWTClaims {
  sub: string; email?: string; role?: string;
  active_role_level?: number; permissions?: string[];
  exp?: number; jti?: string;
}

function verifyIAMToken(token: string): JWTClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const header = JSON.parse(b64urlDecode(h));
    const alg = header.alg === 'HS512' ? 'sha512' : 'sha256';
    const expected = createHmac(alg, IAM_JWT_SECRET)
      .update(`${h}.${p}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (expected !== sig) return null;
    const claims = JSON.parse(b64urlDecode(p)) as JWTClaims;
    if (claims.exp && Date.now() / 1000 > claims.exp) return null;
    return claims;
  } catch { return null; }
}

function requireIAMLevel(maxLevel: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Authentication required', service: SERVICE_ID }); return; }
    const claims = verifyIAMToken(token);
    if (!claims) { res.status(401).json({ error: 'Invalid or expired token', service: SERVICE_ID }); return; }
    const level = claims.active_role_level ?? 6;
    if (level > maxLevel) {
      console.log(JSON.stringify({ level: 'audit', decision: 'DENY', service: SERVICE_ID,
        principal: claims.sub, requiredLevel: maxLevel, actualLevel: level, path: req.path,
        integrityHash: sha512Audit(`DENY:${claims.sub}:${req.path}:${Date.now()}`),
        timestamp: new Date().toISOString() }));
      res.status(403).json({ error: 'Insufficient privilege level', required: maxLevel, actual: level });
      return;
    }
    (req as any).principal = claims;
    next();
  };
}

function iamRequestMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Service-Id', SERVICE_ID);
  res.setHeader('X-Mesh-Address', MESH_ADDRESS);
  res.setHeader('X-IAM-Version', '1.0');
  next();
}

function iamHealthStatus() {
  return {
    iam: {
      version: '1.0', algorithm: IAM_ALGORITHM,
      status: IAM_JWT_SECRET ? 'configured' : 'unconfigured',
      meshAddress: MESH_ADDRESS,
      routingProtocol: process.env.MESH_ROUTING_PROTOCOL || 'static_port',
      cryptoMigrationPath: 'hmac_sha512 → ml_kem (2030) → hybrid_pqc (2040) → slh_dsa (2060)',
    },
  };
}
// ============================================================================
// END IAM MIDDLEWARE
// ============================================================================

// ── Bootstrap ──────────────────────────────────────────────────────────────

const app = express();
export const wellness = new WellnessEngine();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

function fail(res: Response, message: string, status = 400): void {
  res.status(status).json({ success: false, error: message, timestamp: new Date().toISOString() });
}

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

// ── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const summary = wellness.getSummary();
  ok(res, {
    status: 'healthy',
    service: 'serenity-ai',
    uptime: process.uptime(),
    meshWellness: summary.overallStatus,
    totalAgents: summary.totalAgents,
    criticalAgents: summary.criticalAgents,
  });
});

app.get('/metrics', (_req, res) => {
  ok(res, {
    ...wellness.getSummary(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
});

// ── Agents ─────────────────────────────────────────────────────────────────

// GET /agents — list all agent wellness records
app.get('/agents', (_req, res) => {
  const agents = wellness.getAllWellness();
  ok(res, { agents, count: agents.length });
});

// GET /agents/:id — get a specific agent's wellness
app.get('/agents/:id', (req, res) => {
  const agent = wellness.getAgentWellness(req.params.id);
  if (!agent) return fail(res, 'Agent not found', 404);
  ok(res, agent);
});

// POST /agents — register an agent for wellness monitoring
app.post('/agents', (req, res) => {
  const { agentId, name, role, endpoint } = req.body;
  if (!agentId || !name || !role) {
    return fail(res, 'agentId, name, role are required');
  }
  try {
    const agent = wellness.registerAgent({ agentId, name, role, endpoint });
    ok(res, agent, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

// ── Check-ins ──────────────────────────────────────────────────────────────

// POST /agents/:id/checkin — record a wellness check-in
app.post('/agents/:id/checkin', (req, res) => {
  const { errorRate, taskLoad, avgLatencyMs, notes, metadata } = req.body;
  try {
    const checkIn = wellness.checkIn({
      agentId: req.params.id,
      errorRate: errorRate !== undefined ? Number(errorRate) : undefined,
      taskLoad: taskLoad !== undefined ? Number(taskLoad) : undefined,
      avgLatencyMs: avgLatencyMs !== undefined ? Number(avgLatencyMs) : undefined,
      notes,
      metadata,
    });
    ok(res, checkIn, 201);
  } catch (err) {
    fail(res, (err as Error).message, 404);
  }
});

// ── Flags ──────────────────────────────────────────────────────────────────

// POST /agents/:id/flags — raise a wellness flag
app.post('/agents/:id/flags', (req, res) => {
  const { category, severity, message, autoResolveAfterMs } = req.body;
  if (!category || !severity || !message) {
    return fail(res, 'category, severity, message are required');
  }
  const validCategories: SupportCategory[] = ['performance', 'overload', 'error_rate', 'latency', 'resource', 'general'];
  if (!validCategories.includes(category)) {
    return fail(res, `category must be one of: ${validCategories.join(', ')}`);
  }
  try {
    const flag = wellness.raiseFlag({
      agentId: req.params.id,
      category: category as SupportCategory,
      severity,
      message,
      autoResolveAfterMs,
    });
    ok(res, flag, 201);
  } catch (err) {
    fail(res, (err as Error).message, 404);
  }
});

// PATCH /agents/:id/flags/:flagId/resolve — resolve a flag
app.patch('/agents/:id/flags/:flagId/resolve', (req, res) => {
  const flag = wellness.resolveFlag(req.params.id, req.params.flagId);
  if (!flag) return fail(res, 'Flag not found', 404);
  ok(res, flag);
});

// ── Support Tickets ────────────────────────────────────────────────────────

// GET /tickets — list support tickets
app.get('/tickets', (req, res) => {
  const { agentId, status, category } = req.query;
  const tickets = wellness.getTickets({
    agentId: agentId as string | undefined,
    status: status as 'open' | 'in_progress' | 'resolved' | 'closed' | undefined,
    category: category as SupportCategory | undefined,
  });
  ok(res, { tickets, count: tickets.length });
});

// POST /tickets — create a support ticket
app.post('/tickets', (req, res) => {
  const { agentId, title, description, category, priority } = req.body;
  if (!agentId || !title || !description || !category) {
    return fail(res, 'agentId, title, description, category are required');
  }
  const validCategories: SupportCategory[] = ['performance', 'overload', 'error_rate', 'latency', 'resource', 'general'];
  if (!validCategories.includes(category)) {
    return fail(res, `category must be one of: ${validCategories.join(', ')}`);
  }
  try {
    const ticket = wellness.createTicket({ agentId, title, description, category, priority });
    ok(res, ticket, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

// PATCH /tickets/:id — update a support ticket
app.patch('/tickets/:id', (req, res) => {
  const { status, resolution, assignedTo } = req.body;
  const ticket = wellness.updateTicket(req.params.id, { status, resolution, assignedTo });
  if (!ticket) return fail(res, 'Ticket not found', 404);
  ok(res, ticket);
});

// ── Resources ──────────────────────────────────────────────────────────────

// GET /resources — list wellness resources
app.get('/resources', (req, res) => {
  const { category } = req.query;
  const resources = wellness.getResources(category as SupportCategory | undefined);
  ok(res, { resources, count: resources.length });
});

// ── Summary ────────────────────────────────────────────────────────────────

// GET /summary — mesh-wide wellness summary
app.get('/summary', (_req, res) => {
  ok(res, wellness.getSummary());
});

// ── Stats ──────────────────────────────────────────────────────────────────

app.get('/stats', (_req, res) => {
  ok(res, wellness.getSummary());
});


// ═══════════════════════════════════════════════════════════════════════════════
// 2060 SMART RESILIENCE LAYER — Auto-wired by Trancendos Compliance Engine
// ═══════════════════════════════════════════════════════════════════════════════
import {
  SmartTelemetry,
  SmartEventBus,
  SmartCircuitBreaker,
  telemetryMiddleware,
  adaptiveRateLimitMiddleware,
  createHealthEndpoint,
  setupGracefulShutdown,
} from '../middleware/resilience-layer';

// Initialize 2060 singletons
const telemetry2060 = SmartTelemetry.getInstance();
const eventBus2060 = SmartEventBus.getInstance();
const circuitBreaker2060 = new SmartCircuitBreaker(`${SERVICE_ID}-primary`, {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
});

// Wire telemetry middleware (request tracking + trace propagation)
app.use(telemetryMiddleware);

// Wire adaptive rate limiting (IAM-level aware)
app.use(adaptiveRateLimitMiddleware);

// 2060 Enhanced health endpoint with resilience status
app.get('/health/2060', createHealthEndpoint({
  serviceName: SERVICE_ID,
  meshAddress: MESH_ADDRESS,
  getCustomHealth: () => ({
    circuitBreaker: circuitBreaker2060.getState(),
    eventBusListeners: eventBus2060.listenerCount(),
    telemetryMetrics: telemetry2060.getMetricNames().length,
  }),
}));

// Prometheus text format metrics export
app.get('/metrics/prometheus', (_req: any, res: any) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(telemetry2060.exportPrometheus());
});

// Emit service lifecycle events
eventBus2060.emit('service.2060.wired', {
  serviceId: SERVICE_ID,
  meshAddress: MESH_ADDRESS,
  timestamp: new Date().toISOString(),
  features: ['telemetry', 'rate-limiting', 'circuit-breaker', 'event-bus', 'prometheus-export'],
});

// ═══════════════════════════════════════════════════════════════════════════════
// END 2060 SMART RESILIENCE LAYER
// ═══════════════════════════════════════════════════════════════════════════════

// ── Error Handler ──────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  fail(res, err.message || 'Internal server error', 500);
});

export { app };