# The 12 Factors — Detailed Guide

## Factor 1: Natural Language to Tool Calls

The fundamental agent pattern: the LLM converts natural language into structured JSON describing what action to take. Deterministic code then executes that action.

**The LLM decides WHAT to do. Your code controls HOW.**

```typescript
// LLM outputs structured JSON
const nextStep = await llm.run(context)
// => { intent: "send_email", to: "user@example.com", subject: "..." }

// Your code executes it
switch (nextStep.intent) {
  case "send_email":
    await sendEmail(nextStep.to, nextStep.subject, nextStep.body)
    break
  case "done":
    return nextStep.summary
}
```

**Anti-patterns:**
- Letting the LLM generate and execute code directly
- Coupling LLM decision-making with execution logic
- Using complex tool abstractions instead of simple intent + params

---

## Factor 2: Own Your Prompts

Treat prompts as first-class code. Write, version, test, and iterate on them directly. Never delegate prompt construction to a black-box framework.

**What to do:**
- Write prompts as templates you fully control
- Build evals/tests for prompt quality
- Maintain flexibility to try unconventional techniques
- Use tools like BAML or plain string templates

**Anti-patterns:**
- `Agent(role="...", goal="...", personality="...")` — you can't see what tokens reach the model
- Framework abstractions that prevent prompt experimentation
- Not versioning or testing prompts

---

## Factor 3: Own Your Context Window (Context Engineering)

Everything is context engineering. LLMs are stateless functions — to get the best outputs, craft the most information-dense, token-efficient inputs possible.

**Key techniques:**
- Build custom context formats (XML-tagged events in a single message)
- Optimize for information density per token
- Filter sensitive data and resolved errors
- Experiment with non-standard structures — there's no single best format

```typescript
// Instead of raw chat messages, build optimized context
function buildContext(events: Event[]): string {
  return `
<system>You are a deploy agent. Available tools: ...</system>
<pre-fetched>
  <git-tags>${events.filter(e => e.type === 'git_tags').map(formatTag).join('\n')}</git-tags>
  <deploy-status>${currentStatus}</deploy-status>
</pre-fetched>
<events>
  ${events.filter(e => !e.resolved).map(formatEvent).join('\n')}
</events>`
}
```

**Anti-patterns:**
- Blindly passing raw chat message arrays
- Letting frameworks decide context content
- Including unnecessary verbosity or resolved errors

---

## Factor 4: Tools Are Just Structured Outputs

Tools are not magic — they're structured JSON output from the LLM that your code interprets. Define tools as simple data types with an `intent` field.

```typescript
type AgentAction =
  | { intent: "search"; query: string }
  | { intent: "create_ticket"; title: string; body: string }
  | { intent: "request_approval"; action: string; reason: string }
  | { intent: "done"; summary: string }
```

The "next step" can involve pausing, requesting approval, or any flow control — not just executing a function.

---

## Factor 5: Unify Execution State and Business State

Don't separate "where am I in the workflow" from "what has happened so far." The event list IS your state.

**Benefits of unified state:**
- One source of truth
- Trivially serializable (pause/resume)
- Debuggable — replay any conversation
- Forkable — branch from any point

**Anti-patterns:**
- Separate databases for execution metadata vs business data
- State in two places that can drift out of sync
- Complex infrastructure for tracking "current step"

---

## Factor 6: Launch/Pause/Resume with Simple APIs

Agents must be pausable and resumable. Serialize the event list on pause; deserialize and continue on resume.

```typescript
// Pause: serialize events
async function pauseAgent(agentId: string, events: Event[]) {
  await db.save(agentId, JSON.stringify(events))
}

// Resume: deserialize and continue the loop
async function resumeAgent(agentId: string, newEvent: Event) {
  const events = JSON.parse(await db.load(agentId))
  events.push(newEvent)
  return runAgentLoop(events) // same loop, resumed
}
```

**Anti-patterns:**
- Agents that only run synchronously start-to-finish
- Keeping paused agents alive in memory with `while...sleep`
- No way to pause between tool selection and execution

---

## Factor 7: Contact Humans with Tool Calls

Human interaction is just another tool intent. The LLM decides it needs human input, outputs a structured intent, and your code handles notification and pausing.

```typescript
// Define human contact as a regular tool
type AgentAction =
  | { intent: "request_human_input"; question: string; channel: "slack" | "email" }
  | { intent: "request_approval"; action: string; details: string }
  | { intent: "escalate"; reason: string }
  | /* ... other tools ... */

// Handle like any other intent
case "request_human_input":
  await notifyHuman(action.channel, action.question)
  await pauseAgent(agentId, events) // Factor 6
  break // exit loop, resume when human responds
```

This enables "outer loop" agents — agents triggered by events/crons that contact humans when needed, not just chatbot-style interactions.

---

## Factor 8: Own Your Control Flow

Different tool intents trigger different behaviors. A switch statement gives you full control:

```typescript
switch (action.intent) {
  case "search":        // Execute and continue loop
    result = await search(action.query)
    events.push({ type: "tool_result", data: result })
    continue

  case "deploy":        // Request approval first
    await requestApproval(action)
    await pauseAgent(agentId, events)
    break

  case "contact_human": // Pause and wait for response
    await notify(action)
    await pauseAgent(agentId, events)
    break

  case "done":          // Exit loop
    return action.summary
}
```

**Anti-patterns:**
- Treating every tool call identically (execute and continue)
- Framework-imposed control flow without interruption support
- No distinction between low-stakes and high-stakes actions

---

## Factor 9: Compact Errors into Context Window

When a tool call fails, append the error to context so the LLM can self-heal.

```typescript
try {
  result = await executeTool(action)
  consecutiveErrors = 0
  events.push({ type: "tool_result", data: result })
} catch (error) {
  consecutiveErrors++
  events.push({
    type: "error",
    data: `Tool "${action.intent}" failed: ${error.message}`,
    resolved: false
  })

  if (consecutiveErrors >= 3) {
    // Escalate — don't let the agent spin
    await escalateToHuman(events)
    break
  }
  // Continue loop — LLM will read the error and adjust
}
```

**Key rules:**
- Max 3 consecutive retries, then escalate
- Mark errors as resolved when the agent recovers
- Remove resolved errors from context to save tokens (Factor 3)

---

## Factor 10: Small, Focused Agents

Build agents that handle 3-10 steps in a well-scoped domain. Embed micro-agents in a larger deterministic DAG.

```
[Trigger] → [Pre-fetch data] → [Agent: classify intent] → [Agent: handle specific task] → [Notify]
     deterministic              3-5 steps                  5-10 steps                   deterministic
```

**Why small:**
- LLMs lose focus as context grows
- Smaller scope = more reliable outputs
- Easier to test, debug, and maintain
- Compose into larger systems via deterministic orchestration

---

## Factor 11: Trigger from Anywhere

Agents should be triggerable via any channel — not just a chat UI.

**Triggers:** Slack messages, emails, webhooks, cron jobs, GitHub events, form submissions
**Responses:** Same channels — reply in Slack, send email, update ticket, post to webhook

Combine with Factors 6 and 7 for full "outer loop" agents.

---

## Factor 12: Stateless Reducer

An agent is a pure function: `f(events) → nextAction`.

```typescript
// The agent is just a function
async function agentReducer(events: Event[]): Promise<AgentAction> {
  const context = buildContext(events)  // Factor 3
  const action = await llm.run(context) // Factor 1
  return action                         // Structured output (Factor 4)
}

// Testing is trivial
test("agent requests approval for deploys", async () => {
  const events = [
    { type: "user", data: "deploy v2.1 to production" },
  ]
  const action = await agentReducer(events)
  expect(action.intent).toBe("request_approval")
})
```

No hidden mutable state. Everything reconstructable from events. Testable, replayable, debuggable.

---

## Factor 13: Pre-Fetch Context

If you know the agent will need certain data, fetch it before the loop.

```typescript
// DON'T: waste LLM round trips
tools = [fetchGitTags, fetchDeployStatus, deploy, rollback]
// LLM will call fetchGitTags, then fetchDeployStatus, then decide

// DO: pre-fetch predictable data
const gitTags = await fetchGitTags()
const deployStatus = await fetchDeployStatus()
const context = buildContext([
  { type: "pre-fetched", data: { gitTags, deployStatus } },
  ...userEvents
])
tools = [deploy, rollback] // Only decision-making tools
```

Let the LLM focus on decisions, not data fetching.
