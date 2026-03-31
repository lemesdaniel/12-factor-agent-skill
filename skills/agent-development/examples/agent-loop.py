"""
12-Factor Agent — Python Reference Implementation

A complete, production-ready agent loop following all 12 factors.
Adapt tools, context building, and control flow to your use case.
"""

import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Literal

import anthropic

# ============================================================
# Factor 4: Tools as structured outputs — simple typed intents
# ============================================================

# Factor 5: Unified state — everything is an event
@dataclass
class Event:
    type: str  # user_message, pre_fetched, assistant_action, tool_result, error, human_response
    data: Any
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # For error events
    tool: str | None = None
    resolved: bool = False


# ============================================================
# Factor 3: Own your context window
# ============================================================

def build_context(events: list[Event], system_prompt: str) -> str:
    formatted = []
    for e in events:
        if e.type == "error" and e.resolved:
            continue  # Remove resolved errors from context

        match e.type:
            case "user_message":
                formatted.append(f"<user_message>{e.data}</user_message>")
            case "pre_fetched":
                formatted.append(f"<pre_fetched>{json.dumps(e.data, indent=2)}</pre_fetched>")
            case "assistant_action":
                formatted.append(f'<action intent="{e.data["intent"]}">{json.dumps(e.data)}</action>')
            case "tool_result":
                formatted.append(f'<tool_result tool="{e.tool}">{json.dumps(e.data)}</tool_result>')
            case "error":
                formatted.append(f'<error tool="{e.tool}">{e.data}</error>')
            case "human_response":
                formatted.append(f"<human_response>{e.data}</human_response>")

    events_xml = "\n".join(formatted)
    return f"{system_prompt}\n\n<events>\n{events_xml}\n</events>"


# ============================================================
# Factor 2: Own your prompts
# ============================================================

SYSTEM_PROMPT = """You are a support agent that handles customer requests.

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
- Respond with ONLY a JSON action, no other text"""

# ============================================================
# Factor 1: NL → Tool Calls
# ============================================================

client = anthropic.Anthropic()


def get_next_action(context: str) -> dict:
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": context}],
    )
    text = response.content[0].text
    return json.loads(text)


# ============================================================
# Tool implementations
# ============================================================

async def search_knowledge_base(query: str) -> dict:
    # Your implementation here
    return {"results": [f"Answer for: {query}"]}


async def create_ticket(title: str, body: str, priority: str) -> dict:
    # Your implementation here
    return {"ticket_id": "TICKET-123", "status": "created"}


async def notify_human(channel: str, message: str) -> None:
    # Send Slack message, email, etc.
    print(f"[{channel}] {message}")


# ============================================================
# Factor 6: Launch/Pause/Resume
# ============================================================

async def save_state(agent_id: str, events: list[Event]) -> None:
    # Save to your database
    # await db.agents.upsert(id=agent_id, events=json.dumps([asdict(e) for e in events]))
    pass


async def load_state(agent_id: str) -> list[Event]:
    # Load from your database
    # row = await db.agents.find_by_id(agent_id)
    # return [Event(**e) for e in json.loads(row["events"])]
    return []


# ============================================================
# Factor 13: Pre-fetch context
# ============================================================

async def pre_fetch_context(user_message: str) -> dict:
    # Fetch data the agent will almost certainly need
    return {"timestamp": datetime.now(timezone.utc).isoformat()}


# ============================================================
# Factors 8, 9, 12: Control flow, error handling, stateless reducer
# ============================================================

MAX_CONSECUTIVE_ERRORS = 3
MAX_ITERATIONS = 20  # Factor 10: keep agents focused


async def run_agent(agent_id: str, events: list[Event]) -> str:
    consecutive_errors = 0
    iterations = 0

    while iterations < MAX_ITERATIONS:
        iterations += 1
        context = build_context(events, SYSTEM_PROMPT)
        action = get_next_action(context)

        now = datetime.now(timezone.utc).isoformat()
        events.append(Event(type="assistant_action", data=action, timestamp=now))

        intent = action["intent"]

        # Factor 8: Different intents → different behaviors
        match intent:
            case "search_knowledge_base":
                try:
                    result = await search_knowledge_base(action["query"])
                    consecutive_errors = 0
                    events.append(Event(type="tool_result", data=result, tool=intent, timestamp=now))
                except Exception as e:
                    consecutive_errors += 1
                    events.append(Event(
                        type="error", data=f"Search failed: {e}",
                        tool=intent, resolved=False, timestamp=now,
                    ))
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        await notify_human("slack", f"Agent {agent_id} stuck after {MAX_CONSECUTIVE_ERRORS} errors")
                        await save_state(agent_id, events)
                        return "escalated_to_human"
                continue

            case "create_ticket":
                try:
                    result = await create_ticket(action["title"], action["body"], action["priority"])
                    consecutive_errors = 0
                    events.append(Event(type="tool_result", data=result, tool=intent, timestamp=now))
                except Exception as e:
                    consecutive_errors += 1
                    events.append(Event(
                        type="error", data=f"Ticket creation failed: {e}",
                        tool=intent, resolved=False, timestamp=now,
                    ))
                continue

            # Factor 7: Contact humans with tool calls
            case "request_approval":
                await notify_human("slack", f"Approval needed: {action['action']}\n{action['details']}")
                await save_state(agent_id, events)  # Factor 6: pause
                return "paused_for_approval"

            case "contact_human":
                await notify_human(action["channel"], action["message"])
                await save_state(agent_id, events)  # Factor 6: pause
                return "paused_for_human"

            case "done":
                return action["summary"]

    # Max iterations reached
    await notify_human("slack", f"Agent {agent_id} reached max iterations")
    await save_state(agent_id, events)
    return "max_iterations_reached"


# ============================================================
# Factor 11: Trigger from anywhere
# ============================================================

async def launch_agent(source: str, message: str) -> str:
    agent_id = str(uuid.uuid4())
    pre_fetched = await pre_fetch_context(message)

    events = [
        Event(type="pre_fetched", data=pre_fetched),
        Event(type="user_message", data=message),
    ]

    return await run_agent(agent_id, events)


async def resume_agent(agent_id: str, human_response: str) -> str:
    events = await load_state(agent_id)
    events.append(Event(type="human_response", data=human_response))
    return await run_agent(agent_id, events)


# ============================================================
# Usage examples
# ============================================================

# FastAPI endpoints
# @app.post("/agent/launch")
# async def api_launch(req: LaunchRequest):
#     return await launch_agent(req.source, req.message)
#
# @app.post("/agent/{agent_id}/respond")
# async def api_respond(agent_id: str, req: RespondRequest):
#     return await resume_agent(agent_id, req.message)

# Slack bot
# @slack.event("message")
# async def on_message(event):
#     await launch_agent("slack", event["text"])

# Cron job
# @scheduler.scheduled_job("cron", hour=9)
# async def daily_review():
#     await launch_agent("cron", "Daily review of pending items")
