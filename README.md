# 12-Factor Agent Skill for Claude Code

A Claude Code plugin that guides you in building production-grade LLM agents following the [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) principles and [Anthropic's Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) patterns.

## Installation

```bash
# Add the marketplace
/plugin marketplace add lemesdaniel/12-factor-agent-skill

# Install the plugin
/plugin install 12-factor-agent-skill
```

## What's Included

### Skill: `agent-development`

Automatically activates when you ask Claude Code to create, build, or design an AI agent.

**Trigger phrases:** "create an agent", "build an AI agent", "design an agent architecture", "implement a tool-calling agent", "build a multi-step agent", "create an agentic workflow"

### Content

| File | Description |
|------|-------------|
| `SKILL.md` | Main guide with decision framework, the 12 factors quick reference, implementation checklist, and anti-patterns |
| `references/12-factors.md` | Detailed explanation of each factor with code examples |
| `references/anthropic-patterns.md` | Anthropic's workflow and agent patterns (prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer) |
| `examples/agent-loop.ts` | Complete TypeScript agent implementation |
| `examples/agent-loop.py` | Complete Python agent implementation |

## The 12 Factors at a Glance

| # | Factor | Principle |
|---|--------|-----------|
| 1 | **NL to Tool Calls** | LLM outputs structured JSON. Code executes. |
| 2 | **Own Your Prompts** | Write, version, test prompts as first-class code. |
| 3 | **Own Your Context Window** | Build information-dense, token-efficient context. |
| 4 | **Tools = Structured Outputs** | Tools are just intent + params + switch statement. |
| 5 | **Unify State** | All state lives in the event list. One source of truth. |
| 6 | **Launch/Pause/Resume** | Serialize on pause, deserialize on resume. |
| 7 | **Humans via Tool Calls** | Human interaction = just another tool intent. |
| 8 | **Own Control Flow** | Different intents trigger different behaviors. |
| 9 | **Compact Errors** | Append errors to context for self-healing. Max 3 retries. |
| 10 | **Small Focused Agents** | 3-10 steps per agent. Compose into larger systems. |
| 11 | **Trigger Anywhere** | Slack, email, webhooks, crons — not just chat UIs. |
| 12 | **Stateless Reducer** | `f(events) -> nextAction`. Pure function. Testable. |
| 13 | **Pre-fetch Context** | Fetch predictable data before the loop. |

## Decision Framework

```
Can a single LLM call solve it?
├── Yes -> Augmented LLM (optimize prompt + retrieval)
└── No -> Are the steps predictable?
    ├── Yes -> Which workflow pattern fits?
    │   ├── Sequential fixed steps -> Prompt Chaining
    │   ├── Input classification -> Routing
    │   ├── Independent subtasks -> Parallelization
    │   ├── Dynamic subtask decomposition -> Orchestrator-Workers
    │   └── Iterative refinement -> Evaluator-Optimizer
    └── No -> Autonomous Agent (with guardrails)
```

## Credits

- [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) by Dex Horthy / HumanLayer
- [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) by Anthropic

## License

MIT
