---
name: Agent Development (12-Factor)
description: >-
  Guide for building production-grade LLM agents following 12-factor principles and Anthropic's patterns.
  Use this skill when the user asks to "create an agent", "build an AI agent", "design an agent architecture",
  "implement a tool-calling agent", "build a multi-step agent", "create an agentic workflow",
  "implement agent patterns", or mentions agent development, agent loops, tool calling systems,
  context engineering, or agent control flow.
---

# Agent Development Guide

Build production-grade LLM agents following the 12-Factor Agents principles and Anthropic's Building Effective Agents patterns.

## Core Philosophy

Agents are software with LLM steps sprinkled in at the right points. The best agents are mostly deterministic code, with LLMs handling decision-making and natural language understanding. Start simple, add complexity only when needed.

## Decision Framework: What to Build

Before building, choose the simplest architecture that solves the problem:

| Need | Solution |
|------|----------|
| Single LLM call with good prompt + retrieval | **Augmented LLM** (no agent needed) |
| Sequential steps, fixed pipeline | **Prompt Chaining** workflow |
| Input classification → specialized handling | **Routing** workflow |
| Independent subtasks run simultaneously | **Parallelization** workflow |
| Dynamic subtask decomposition | **Orchestrator-Workers** workflow |
| Iterative refinement with feedback | **Evaluator-Optimizer** workflow |
| Open-ended, unpredictable steps, needs tools | **Autonomous Agent** |

For workflow patterns and when to use each, consult **`references/anthropic-patterns.md`**.

## The Agent Loop (Core Pattern)

Every agent follows the same fundamental loop:

```typescript
const events: Event[] = [initialEvent]

while (true) {
  const context = buildContext(events)      // Factor 3: own your context
  const nextStep = await llm.run(context)   // Factor 1: NL → structured output
  events.push({ type: "assistant", data: nextStep })

  if (nextStep.intent === "done") {
    return nextStep.finalAnswer
  }

  if (nextStep.intent === "contact_human") { // Factor 7: humans via tools
    await notifyHuman(nextStep)
    break // Factor 6: pause, resume later via webhook
  }

  try {
    const result = await executeTool(nextStep) // Factor 8: own control flow
    events.push({ type: "tool_result", data: result })
  } catch (error) {
    events.push({ type: "error", data: formatError(error) }) // Factor 9
    if (consecutiveErrors >= 3) break
  }
}
```

## The 12 Factors (Quick Reference)

| # | Factor | Principle |
|---|--------|-----------|
| 1 | **NL → Tool Calls** | LLM outputs structured JSON (intent + params). Code executes. Never let LLMs execute directly. |
| 2 | **Own Your Prompts** | Write, version, test prompts as first-class code. No black-box framework abstractions. |
| 3 | **Own Your Context Window** | Everything is context engineering. Build information-dense, token-efficient context. Experiment with formats. |
| 4 | **Tools = Structured Outputs** | Tools are just structured JSON with an intent field + switch statement. Not complex abstractions. |
| 5 | **Unify State** | All state lives in the event list. No separate execution vs business state. One source of truth. |
| 6 | **Launch/Pause/Resume** | Serialize state on pause, deserialize on resume. Support pausing between tool selection and execution. |
| 7 | **Humans via Tool Calls** | Human interaction = just another tool intent (`request_approval`, `request_input`). Not a special channel. |
| 8 | **Own Control Flow** | Different intents → different behaviors (execute, pause, request approval). Use a switch statement. |
| 9 | **Compact Errors** | Append errors to context so LLM self-heals. Limit retries (3 max). Remove resolved errors. |
| 10 | **Small Focused Agents** | 3-10 steps per agent. Embed micro-agents in deterministic DAGs. Scope tightly. |
| 11 | **Trigger Anywhere** | Agents via Slack, email, webhooks, crons — not just chat UIs. |
| 12 | **Stateless Reducer** | `f(events) → nextAction`. Pure function. No hidden mutable state. Testable, replayable. |
| 13 | **Pre-fetch Context** | Fetch predictable data before the loop. Don't waste LLM round trips on known needs. |

For detailed explanations and examples, consult **`references/12-factors.md`**.

## Implementation Checklist

### 1. Define the Agent's Scope (Factor 10)
- What specific task does this agent solve?
- What are the 3-10 steps it will take?
- What tools does it need?
- What triggers it? (Factor 11)

### 2. Design Tools (Factors 1, 4)
- Define each tool as a typed schema (intent + parameters)
- Include `done` and `contact_human` intents
- Apply poka-yoke: make misuse impossible (absolute paths, enums over free text)
- Document tools like API docs for a junior developer

### 3. Build Context (Factors 3, 5, 13)
- Pre-fetch all predictable data before the loop
- Design a token-efficient context format (XML tags, structured events)
- Unify execution and business state in the event list
- Filter sensitive data, remove resolved errors

### 4. Write Your Prompt (Factor 2)
- Own the full prompt — no framework magic
- Include: role, available tools with schemas, current context, constraints
- Test and iterate with evals
- Keep it focused on the agent's specific scope

### 5. Implement Control Flow (Factors 6, 7, 8, 9)
- Switch on intent: each tool type gets its own handler
- Handle errors: catch, format, append to context, retry (max 3)
- Support pause/resume: serialize events, resume via webhook
- Human-in-the-loop: treat as tool call, not special channel

### 6. Make It a Stateless Reducer (Factor 12)
- `f(events) → nextAction` — no hidden state
- All state reconstructable from event history
- Trivially testable: feed events, assert next action

## Tool Design Template

```typescript
// Factor 4: Tools as structured outputs
type AgentAction =
  | { intent: "search_docs"; query: string }
  | { intent: "update_record"; id: string; fields: Record<string, any> }
  | { intent: "contact_human"; channel: "slack" | "email"; message: string }
  | { intent: "done"; summary: string }

// Factor 8: Own your control flow
async function handleAction(action: AgentAction, events: Event[]) {
  switch (action.intent) {
    case "search_docs":
      return await searchDocs(action.query)
    case "update_record":
      return await updateRecord(action.id, action.fields)
    case "contact_human":
      await notify(action.channel, action.message)
      await saveState(events) // Factor 6: pause
      return "paused_for_human"
    case "done":
      return action.summary
  }
}
```

## Anti-Patterns to Avoid

- **"Loop until solved"** monoliths with unbounded context growth
- **Black-box frameworks** that hide prompts and control flow
- **LLMs executing directly** instead of outputting structured decisions
- **Separate execution state** from business state
- **Unlimited retries** that let agents spin out
- **Chat-only interfaces** — agents should work from any trigger
- **Over-engineering** tools and abstractions before validating the approach
- **Starting complex** — always begin with the simplest pattern that works

## Additional Resources

### Reference Files
- **`references/12-factors.md`** — Detailed guide for each of the 12 factors with examples
- **`references/anthropic-patterns.md`** — Anthropic's workflow and agent patterns with implementation details

### Examples
- **`examples/agent-loop.ts`** — Complete TypeScript agent loop implementation
- **`examples/agent-loop.py`** — Complete Python agent loop implementation
