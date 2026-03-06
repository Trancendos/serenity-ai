# Serenity AI 🌿

> Agent wellness monitoring, check-ins, flags, support tickets, and wellness resources for the Trancendos mesh.
> Zero-cost compliant — no LLM calls, all rule-based wellness scoring.

**Port:** `3025`
**Architecture:** Trancendos Industry 6.0 / 2060 Standard

---

## Overview

Serenity AI monitors the wellness of all agents in the Trancendos mesh. It tracks wellness scores based on error rates, task load, and latency, raises flags when agents are struggling, manages support tickets, and provides wellness resources for recovery.

---

## Wellness Scoring

Wellness scores start at 100 and are reduced by:

| Factor | Deduction |
|--------|-----------|
| Error rate > 5% | -5 to -30 points |
| Task load > 80% | -5 to -25 points |
| Avg latency > 500ms | -5 to -20 points |
| Active flags | -5 to -15 points each |

## Wellness Status

| Status | Score Range |
|--------|-------------|
| `optimal` | ≥ 90 |
| `good` | ≥ 75 |
| `fair` | ≥ 60 |
| `stressed` | ≥ 40 |
| `critical` | < 40 |

---

## API Reference

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + mesh wellness overview |
| GET | `/metrics` | Runtime metrics + wellness summary |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agents` | List all agent wellness records |
| GET | `/agents/:id` | Get a specific agent's wellness |
| POST | `/agents` | Register an agent for wellness monitoring |
| POST | `/agents/:id/checkin` | Record a wellness check-in |

### Flags

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents/:id/flags` | Raise a wellness flag |
| PATCH | `/agents/:id/flags/:flagId/resolve` | Resolve a flag |

### Support Tickets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets` | List tickets (filter by agentId, status, category) |
| POST | `/tickets` | Create a support ticket |
| PATCH | `/tickets/:id` | Update a ticket |

### Resources

| Method | Path | Description |
|--------|------|-------------|
| GET | `/resources` | List wellness resources (filter by category) |

### Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/summary` | Mesh-wide wellness summary |
| GET | `/stats` | Wellness statistics |

---

## Usage Examples

### Register an Agent

```bash
curl -X POST http://localhost:3025/agents \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-agent",
    "name": "My Agent",
    "role": "processor",
    "endpoint": "http://my-agent:3000/health"
  }'
```

### Record a Check-in

```bash
curl -X POST http://localhost:3025/agents/my-agent/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "errorRate": 0.02,
    "taskLoad": 0.65,
    "avgLatencyMs": 120,
    "notes": "All systems nominal"
  }'
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3025` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |
| `LOG_LEVEL` | `info` | Pino log level |
| `WELLNESS_INTERVAL_MS` | `1200000` | Periodic wellness summary interval (ms) |

---

## Development

```bash
npm install
npm run dev       # tsx watch mode
npm run build     # compile TypeScript
npm start         # run compiled output
```

---

## Default Monitored Agents

Serenity AI seeds 5 core agents on startup:
- cornelius-ai, norman-ai, the-dr-ai, guardian-ai, dorris-ai

---

*Part of the Trancendos Industry 6.0 mesh — 2060 Standard*