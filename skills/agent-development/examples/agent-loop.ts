/**
 * 12-Factor Agent — TypeScript Reference Implementation
 *
 * A complete, production-ready agent loop following all 12 factors.
 * Adapt tools, context building, and control flow to your use case.
 */

import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// Factor 4: Tools as structured outputs — simple typed intents
// ============================================================

type AgentAction =
  | { intent: "search_knowledge_base"; query: string }
  | { intent: "create_ticket"; title: string; body: string; priority: "low" | "medium" | "high" }
  | { intent: "request_approval"; action: string; details: string }
  | { intent: "contact_human"; channel: "slack" | "email"; message: string }
  | { intent: "done"; summary: string };

// Factor 5: Unified state — everything is an event
type Event =
  | { type: "user_message"; data: string; timestamp: string }
  | { type: "pre_fetched"; data: Record<string, unknown>; timestamp: string }
  | { type: "assistant_action"; data: AgentAction; timestamp: string }
  | { type: "tool_result"; tool: string; data: unknown; timestamp: string }
  | { type: "error"; tool: string; message: string; resolved: boolean; timestamp: string }
  | { type: "human_response"; data: string; timestamp: string };

// ============================================================
// Factor 3: Own your context window — build information-dense context
// ============================================================

function buildContext(events: Event[], systemPrompt: string): string {
  const formattedEvents = events
    .filter((e) => !(e.type === "error" && e.resolved)) // Remove resolved errors
    .map((e) => {
      switch (e.type) {
        case "user_message":
          return `<user_message>${e.data}</user_message>`;
        case "pre_fetched":
          return `<pre_fetched>${JSON.stringify(e.data, null, 2)}</pre_fetched>`;
        case "assistant_action":
          return `<action intent="${e.data.intent}">${JSON.stringify(e.data)}</action>`;
        case "tool_result":
          return `<tool_result tool="${e.tool}">${JSON.stringify(e.data)}</tool_result>`;
        case "error":
          return `<error tool="${e.tool}">${e.message}</error>`;
        case "human_response":
          return `<human_response>${e.data}</human_response>`;
      }
    })
    .join("\n");

  return `${systemPrompt}\n\n<events>\n${formattedEvents}\n</events>`;
}

// ============================================================
// Factor 2: Own your prompts — first-class, versionable prompt
// ============================================================

const SYSTEM_PROMPT = `You are a support agent that handles customer requests.

Available actions (respond with JSON matching one of these):
- search_knowledge_base: { "intent": "search_knowledge_base", "query": "..." }
- create_ticket: { "intent": "create_ticket", "title": "...", "body": "...", "priority": "low|medium|high" }
- request_approval: { "intent": "request_approval", "action": "...", "details": "..." }
- contact_human: { "intent": "contact_human", "channel": "slack|email", "message": "..." }
- done: { "intent": "done", "summary": "..." }

Rules:
- Always search the knowledge base before creating tickets
- Request approval for high-priority tickets
- Contact a human if you're unsure about the right action
- Respond with ONLY a JSON action, no other text`;

// ============================================================
// Factor 1: NL → Tool Calls — LLM outputs structured JSON
// ============================================================

const client = new Anthropic();

async function getNextAction(context: string): Promise<AgentAction> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: context }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text) as AgentAction;
}

// ============================================================
// Tool implementations
// ============================================================

async function searchKnowledgeBase(query: string): Promise<unknown> {
  // Your implementation here
  return { results: [`Answer for: ${query}`] };
}

async function createTicket(title: string, body: string, priority: string): Promise<unknown> {
  // Your implementation here
  return { ticketId: "TICKET-123", status: "created" };
}

async function notifyHuman(channel: string, message: string): Promise<void> {
  // Send Slack message, email, etc.
  console.log(`[${channel}] ${message}`);
}

// ============================================================
// Factor 6: Launch/Pause/Resume — serialize state
// ============================================================

async function saveState(agentId: string, events: Event[]): Promise<void> {
  // Save to your database
  // await db.agents.upsert({ id: agentId, events: JSON.stringify(events) })
}

async function loadState(agentId: string): Promise<Event[]> {
  // Load from your database
  // const row = await db.agents.findById(agentId)
  // return JSON.parse(row.events)
  return [];
}

// ============================================================
// Factor 13: Pre-fetch predictable context
// ============================================================

async function preFetchContext(userMessage: string): Promise<Record<string, unknown>> {
  // Fetch data the agent will almost certainly need
  // const userProfile = await getUser(userId)
  // const recentTickets = await getRecentTickets(userId)
  return {
    // userProfile,
    // recentTickets,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// Factor 8: Own your control flow — switch on intent
// Factor 9: Compact errors — catch, append, retry
// Factor 12: Stateless reducer — f(events) → next action
// ============================================================

const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_ITERATIONS = 20; // Factor 10: keep agents focused

async function runAgent(agentId: string, events: Event[]): Promise<string> {
  let consecutiveErrors = 0;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const context = buildContext(events, SYSTEM_PROMPT);
    const action = await getNextAction(context);

    const now = new Date().toISOString();
    events.push({ type: "assistant_action", data: action, timestamp: now });

    // Factor 8: Different intents → different behaviors
    switch (action.intent) {
      case "search_knowledge_base": {
        try {
          const result = await searchKnowledgeBase(action.query);
          consecutiveErrors = 0;
          events.push({ type: "tool_result", tool: action.intent, data: result, timestamp: now });
        } catch (error) {
          consecutiveErrors++;
          events.push({
            type: "error",
            tool: action.intent,
            message: `Search failed: ${(error as Error).message}`,
            resolved: false,
            timestamp: now,
          });
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            await notifyHuman("slack", `Agent ${agentId} stuck after ${MAX_CONSECUTIVE_ERRORS} errors`);
            await saveState(agentId, events);
            return "escalated_to_human";
          }
        }
        continue;
      }

      case "create_ticket": {
        try {
          const result = await createTicket(action.title, action.body, action.priority);
          consecutiveErrors = 0;
          events.push({ type: "tool_result", tool: action.intent, data: result, timestamp: now });
        } catch (error) {
          consecutiveErrors++;
          events.push({
            type: "error",
            tool: action.intent,
            message: `Ticket creation failed: ${(error as Error).message}`,
            resolved: false,
            timestamp: now,
          });
        }
        continue;
      }

      // Factor 7: Contact humans with tool calls
      case "request_approval": {
        await notifyHuman("slack", `Approval needed: ${action.action}\n${action.details}`);
        await saveState(agentId, events); // Factor 6: pause
        return "paused_for_approval";
      }

      case "contact_human": {
        await notifyHuman(action.channel, action.message);
        await saveState(agentId, events); // Factor 6: pause
        return "paused_for_human";
      }

      case "done": {
        return action.summary;
      }
    }
  }

  // Max iterations reached — escalate
  await notifyHuman("slack", `Agent ${agentId} reached max iterations`);
  await saveState(agentId, events);
  return "max_iterations_reached";
}

// ============================================================
// Factor 11: Trigger from anywhere
// ============================================================

// Launch: triggered by webhook, Slack, email, cron, etc.
async function launchAgent(trigger: { source: string; message: string }): Promise<string> {
  const agentId = crypto.randomUUID();
  const preFetched = await preFetchContext(trigger.message);

  const events: Event[] = [
    { type: "pre_fetched", data: preFetched, timestamp: new Date().toISOString() },
    { type: "user_message", data: trigger.message, timestamp: new Date().toISOString() },
  ];

  return runAgent(agentId, events);
}

// Resume: called when human responds via webhook
async function resumeAgent(agentId: string, humanResponse: string): Promise<string> {
  const events = await loadState(agentId);
  events.push({ type: "human_response", data: humanResponse, timestamp: new Date().toISOString() });
  return runAgent(agentId, events);
}

// ============================================================
// Usage
// ============================================================

// From a webhook
// app.post("/agent/launch", (req) => launchAgent(req.body))
// app.post("/agent/:id/respond", (req) => resumeAgent(req.params.id, req.body.message))

// From Slack
// slackBot.on("message", (msg) => launchAgent({ source: "slack", message: msg.text }))

// From cron
// cron.schedule("0 9 * * *", () => launchAgent({ source: "cron", message: "Daily review" }))
