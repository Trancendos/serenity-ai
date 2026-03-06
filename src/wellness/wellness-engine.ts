/**
 * Serenity AI — Wellness & Support Engine
 *
 * Provides wellness monitoring, agent health tracking, stress detection,
 * and support resources for the Trancendos mesh. Ensures agents operate
 * within healthy parameters and flags burnout/overload conditions.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────

export type WellnessStatus = 'optimal' | 'good' | 'fair' | 'stressed' | 'critical';
export type SupportCategory = 'performance' | 'overload' | 'error_rate' | 'latency' | 'resource' | 'general';
export type CheckInStatus = 'healthy' | 'needs_attention' | 'critical';
export type ResourceType = 'guide' | 'runbook' | 'checklist' | 'template' | 'contact';

export interface AgentWellness {
  agentId: string;
  agentName: string;
  status: WellnessStatus;
  wellnessScore: number;    // 0-100
  errorRate: number;        // percentage
  avgLatency: number;       // ms
  taskLoad: number;         // 0-100 percentage
  lastCheckIn: Date;
  checkInHistory: CheckIn[];
  flags: WellnessFlag[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckIn {
  id: string;
  agentId: string;
  status: CheckInStatus;
  metrics: {
    errorRate: number;
    avgLatency: number;
    taskLoad: number;
    memoryUsage?: number;
  };
  notes?: string;
  timestamp: Date;
}

export interface WellnessFlag {
  id: string;
  agentId: string;
  category: SupportCategory;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  resolved: boolean;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface SupportTicket {
  id: string;
  agentId: string;
  category: SupportCategory;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  resolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WellnessResource {
  id: string;
  title: string;
  type: ResourceType;
  category: SupportCategory;
  content: string;
  tags: string[];
  createdAt: Date;
}

export interface WellnessSummary {
  totalAgents: number;
  optimalAgents: number;
  stressedAgents: number;
  criticalAgents: number;
  averageWellnessScore: number;
  openFlags: number;
  openTickets: number;
  meshWellnessStatus: WellnessStatus;
}

// ── Wellness Engine ───────────────────────────────────────────────────────

export class WellnessEngine {
  private agents: Map<string, AgentWellness> = new Map();
  private tickets: Map<string, SupportTicket> = new Map();
  private resources: Map<string, WellnessResource> = new Map();

  constructor() {
    this.seedAgents();
    this.seedResources();
    logger.info('WellnessEngine (Serenity AI) initialized — wellness monitoring active');
  }

  // ── Agent Wellness ──────────────────────────────────────────────────────

  registerAgent(params: {
    agentId: string;
    agentName: string;
  }): AgentWellness {
    const wellness: AgentWellness = {
      agentId: params.agentId,
      agentName: params.agentName,
      status: 'optimal',
      wellnessScore: 100,
      errorRate: 0,
      avgLatency: 0,
      taskLoad: 0,
      lastCheckIn: new Date(),
      checkInHistory: [],
      flags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.agents.set(params.agentId, wellness);
    logger.info({ agentId: params.agentId, name: params.agentName }, 'Agent registered for wellness monitoring');
    return wellness;
  }

  checkIn(params: {
    agentId: string;
    metrics: CheckIn['metrics'];
    notes?: string;
  }): CheckIn {
    let wellness = this.agents.get(params.agentId);
    if (!wellness) {
      wellness = this.registerAgent({ agentId: params.agentId, agentName: params.agentId });
    }

    const checkIn: CheckIn = {
      id: uuidv4(),
      agentId: params.agentId,
      status: this.evaluateCheckInStatus(params.metrics),
      metrics: params.metrics,
      notes: params.notes,
      timestamp: new Date(),
    };

    wellness.checkInHistory.push(checkIn);
    if (wellness.checkInHistory.length > 100) wellness.checkInHistory.shift();

    // Update wellness metrics
    wellness.errorRate = params.metrics.errorRate;
    wellness.avgLatency = params.metrics.avgLatency;
    wellness.taskLoad = params.metrics.taskLoad;
    wellness.lastCheckIn = new Date();
    wellness.updatedAt = new Date();

    // Recalculate wellness score and status
    this.recalculateWellness(wellness);

    return checkIn;
  }

  getAgentWellness(agentId: string): AgentWellness | undefined {
    return this.agents.get(agentId);
  }

  getAllWellness(): AgentWellness[] {
    return Array.from(this.agents.values()).sort((a, b) => a.wellnessScore - b.wellnessScore);
  }

  // ── Flags ────────────────────────────────────────────────────────────────

  raiseFlag(params: {
    agentId: string;
    category: SupportCategory;
    severity: WellnessFlag['severity'];
    message: string;
  }): WellnessFlag {
    let wellness = this.agents.get(params.agentId);
    if (!wellness) {
      wellness = this.registerAgent({ agentId: params.agentId, agentName: params.agentId });
    }

    const flag: WellnessFlag = {
      id: uuidv4(),
      agentId: params.agentId,
      category: params.category,
      severity: params.severity,
      message: params.message,
      resolved: false,
      createdAt: new Date(),
    };

    wellness.flags.push(flag);
    wellness.updatedAt = new Date();
    logger.warn({ flagId: flag.id, agentId: params.agentId, severity: flag.severity }, flag.message);
    return flag;
  }

  resolveFlag(agentId: string, flagId: string): WellnessFlag | undefined {
    const wellness = this.agents.get(agentId);
    if (!wellness) return undefined;
    const flag = wellness.flags.find(f => f.id === flagId);
    if (!flag) return undefined;
    flag.resolved = true;
    flag.resolvedAt = new Date();
    this.recalculateWellness(wellness);
    return flag;
  }

  // ── Support Tickets ──────────────────────────────────────────────────────

  createTicket(params: {
    agentId: string;
    category: SupportCategory;
    title: string;
    description: string;
    priority?: SupportTicket['priority'];
  }): SupportTicket {
    const ticket: SupportTicket = {
      id: uuidv4(),
      agentId: params.agentId,
      category: params.category,
      title: params.title,
      description: params.description,
      status: 'open',
      priority: params.priority || 'normal',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tickets.set(ticket.id, ticket);
    logger.info({ ticketId: ticket.id, agentId: params.agentId, category: params.category }, 'Support ticket created');
    return ticket;
  }

  updateTicket(ticketId: string, updates: {
    status?: SupportTicket['status'];
    resolution?: string;
    priority?: SupportTicket['priority'];
  }): SupportTicket | undefined {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return undefined;
    if (updates.status) ticket.status = updates.status;
    if (updates.resolution) ticket.resolution = updates.resolution;
    if (updates.priority) ticket.priority = updates.priority;
    ticket.updatedAt = new Date();
    return ticket;
  }

  getTickets(filters?: {
    agentId?: string;
    status?: SupportTicket['status'];
    category?: SupportCategory;
  }): SupportTicket[] {
    let tickets = Array.from(this.tickets.values());
    if (filters?.agentId) tickets = tickets.filter(t => t.agentId === filters.agentId);
    if (filters?.status) tickets = tickets.filter(t => t.status === filters.status);
    if (filters?.category) tickets = tickets.filter(t => t.category === filters.category);
    return tickets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ── Resources ────────────────────────────────────────────────────────────

  getResources(category?: SupportCategory): WellnessResource[] {
    let resources = Array.from(this.resources.values());
    if (category) resources = resources.filter(r => r.category === category);
    return resources;
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  getSummary(): WellnessSummary {
    const agents = Array.from(this.agents.values());
    const tickets = Array.from(this.tickets.values());

    const avgScore = agents.length > 0
      ? agents.reduce((sum, a) => sum + a.wellnessScore, 0) / agents.length
      : 100;

    const openFlags = agents.reduce((sum, a) => sum + a.flags.filter(f => !f.resolved).length, 0);
    const criticalAgents = agents.filter(a => a.status === 'critical').length;
    const stressedAgents = agents.filter(a => a.status === 'stressed').length;

    let meshStatus: WellnessStatus = 'optimal';
    if (avgScore < 90) meshStatus = 'good';
    if (avgScore < 75) meshStatus = 'fair';
    if (avgScore < 60 || stressedAgents > 2) meshStatus = 'stressed';
    if (criticalAgents > 0 || avgScore < 40) meshStatus = 'critical';

    return {
      totalAgents: agents.length,
      optimalAgents: agents.filter(a => a.status === 'optimal' || a.status === 'good').length,
      stressedAgents,
      criticalAgents,
      averageWellnessScore: avgScore,
      openFlags,
      openTickets: tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length,
      meshWellnessStatus: meshStatus,
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private evaluateCheckInStatus(metrics: CheckIn['metrics']): CheckInStatus {
    if (metrics.errorRate > 10 || metrics.taskLoad > 90) return 'critical';
    if (metrics.errorRate > 5 || metrics.taskLoad > 75 || metrics.avgLatency > 2000) return 'needs_attention';
    return 'healthy';
  }

  private recalculateWellness(wellness: AgentWellness): void {
    let score = 100;

    // Deduct for error rate
    if (wellness.errorRate > 10) score -= 30;
    else if (wellness.errorRate > 5) score -= 15;
    else if (wellness.errorRate > 1) score -= 5;

    // Deduct for task load
    if (wellness.taskLoad > 90) score -= 25;
    else if (wellness.taskLoad > 75) score -= 10;
    else if (wellness.taskLoad > 60) score -= 5;

    // Deduct for latency
    if (wellness.avgLatency > 5000) score -= 20;
    else if (wellness.avgLatency > 2000) score -= 10;
    else if (wellness.avgLatency > 1000) score -= 5;

    // Deduct for unresolved flags
    const openFlags = wellness.flags.filter(f => !f.resolved);
    const criticalFlags = openFlags.filter(f => f.severity === 'critical').length;
    const warningFlags = openFlags.filter(f => f.severity === 'warning').length;
    score -= criticalFlags * 15 + warningFlags * 5;

    wellness.wellnessScore = Math.max(0, Math.min(100, score));

    if (wellness.wellnessScore >= 90) wellness.status = 'optimal';
    else if (wellness.wellnessScore >= 75) wellness.status = 'good';
    else if (wellness.wellnessScore >= 60) wellness.status = 'fair';
    else if (wellness.wellnessScore >= 40) wellness.status = 'stressed';
    else wellness.status = 'critical';
  }

  private seedAgents(): void {
    const coreAgents = [
      { agentId: 'cornelius-ai', agentName: 'Cornelius AI' },
      { agentId: 'the-dr-ai', agentName: 'The Dr AI' },
      { agentId: 'norman-ai', agentName: 'Norman AI' },
      { agentId: 'guardian-ai', agentName: 'Guardian AI' },
      { agentId: 'dorris-ai', agentName: 'Dorris AI' },
    ];
    for (const a of coreAgents) this.registerAgent(a);
    logger.info({ count: coreAgents.length }, 'Core agents registered for wellness monitoring');
  }

  private seedResources(): void {
    const resources: Omit<WellnessResource, 'id' | 'createdAt'>[] = [
      {
        title: 'High Error Rate Runbook',
        type: 'runbook',
        category: 'error_rate',
        content: 'Steps to diagnose and resolve high error rates: 1. Check logs, 2. Review recent deployments, 3. Check dependencies, 4. Scale if needed.',
        tags: ['error', 'debugging', 'runbook'],
      },
      {
        title: 'Overload Recovery Guide',
        type: 'guide',
        category: 'overload',
        content: 'When an agent is overloaded: 1. Shed non-critical tasks, 2. Request resource allocation from The Treasury, 3. Notify Cornelius AI.',
        tags: ['overload', 'recovery', 'guide'],
      },
      {
        title: 'Performance Optimization Checklist',
        type: 'checklist',
        category: 'performance',
        content: '[ ] Review query patterns [ ] Check caching [ ] Profile hot paths [ ] Review memory usage [ ] Check for N+1 queries',
        tags: ['performance', 'optimization', 'checklist'],
      },
    ];
    for (const r of resources) {
      const resource: WellnessResource = { id: uuidv4(), ...r, createdAt: new Date() };
      this.resources.set(resource.id, resource);
    }
    logger.info({ count: resources.length }, 'Wellness resources seeded');
  }
}