# Anthropic's Building Effective Agents — Patterns Reference

Source: https://www.anthropic.com/engineering/building-effective-agents

## Core Principle

**Start simple. Add complexity only when needed.** Agentic systems trade latency and cost for better task performance. For many applications, a single optimized LLM call with retrieval and in-context examples is enough.

## Workflows vs. Agents

- **Workflows**: LLMs and tools orchestrated through predefined code paths. Predictable, consistent.
- **Agents**: LLMs dynamically direct their own processes and tool usage. Flexible, model-driven.

Use workflows for well-defined tasks. Use agents for open-ended problems where steps can't be predicted.

---

## Workflow Patterns

### 1. Prompt Chaining

Sequential LLM calls where each processes the previous output. Add programmatic validation gates between steps.

```
[Input] → [LLM: Generate outline] → [Gate: validate] → [LLM: Write from outline] → [Output]
```

**When to use:** Tasks cleanly decomposable into fixed subtasks. Trades latency for accuracy.

**Examples:**
- Generate marketing copy → translate to target language
- Create document outline → validate structure → write full document
- Extract data → transform → validate → load

---

### 2. Routing

Classify input, direct to specialized handlers.

```
[Input] → [LLM: Classify] → ┬→ [Handler A: refund]
                              ├→ [Handler B: technical]
                              └→ [Handler C: general]
```

**When to use:** Distinct categories needing different prompts/tools. Classification must be accurate.

**Examples:**
- Customer service: refunds vs technical vs general
- Model routing: simple → Haiku, complex → Sonnet/Opus

---

### 3. Parallelization

LLMs work simultaneously, results aggregated programmatically.

**Sectioning:** Break into independent subtasks.
```
[Input] → ┬→ [LLM: Aspect A] →┬→ [Aggregate] → [Output]
           ├→ [LLM: Aspect B] →┤
           └→ [LLM: Aspect C] →┘
```

**Voting:** Same task, multiple times, for confidence.
```
[Input] → ┬→ [LLM: Attempt 1] →┬→ [Majority vote] → [Output]
           ├→ [LLM: Attempt 2] →┤
           └→ [LLM: Attempt 3] →┘
```

**When to use:** Subtasks can run in parallel for speed, or multiple perspectives increase confidence.

---

### 4. Orchestrator-Workers

Central LLM dynamically decomposes task, delegates to workers, synthesizes results.

```
[Input] → [Orchestrator LLM] → ┬→ [Worker LLM 1] →┬→ [Orchestrator: synthesize] → [Output]
                                 ├→ [Worker LLM 2] →┤
                                 └→ [Worker LLM N] →┘
```

**Key difference from parallelization:** Subtasks are NOT predefined — the orchestrator determines them based on input.

**When to use:** Complex tasks where required subtasks can't be predicted (multi-file code changes, multi-source research).

---

### 5. Evaluator-Optimizer

One LLM generates, another evaluates and provides feedback, in a loop.

```
[Input] → [LLM: Generate] → [LLM: Evaluate] → ┬→ [Pass] → [Output]
               ↑                                 │
               └─────── [Feedback] ←─────────────┘ [Fail]
```

**When to use:** Clear evaluation criteria exist AND LLM responses demonstrably improve with articulated feedback.

**Examples:**
- Literary translation with nuance evaluation
- Code generation with test-based evaluation

---

## Autonomous Agent Pattern

For open-ended problems where steps can't be predicted. The LLM dynamically decides what to do next in a loop.

```
[Human command] → [LLM: plan] → [Tool use] → [Observe result] → [LLM: next step] → ... → [Done]
```

**Key characteristics:**
- Gain "ground truth" from environment at each step
- Checkpoint for human feedback at key points
- Terminate on completion or max iterations
- Implementation is straightforward: LLM + tools + loop

**Cautions:**
- Higher cost, potential for compounding errors
- Requires sandboxed testing and guardrails
- Trust level should match autonomy level

---

## Tool Design Best Practices

Tools deserve as much engineering attention as prompts.

### Design Principles

1. **Give models room to think** before committing to structured output
2. **Keep formats natural** — close to what models have seen in training
3. **Minimize formatting overhead** — no line counting, no string escaping
4. **Apply poka-yoke** — make mistakes impossible (e.g., absolute paths, enums)
5. **Document like API docs for a junior developer** — usage examples, edge cases, boundaries

### What Good Tool Definitions Include

- Clear description of what the tool does
- Parameter descriptions with types and constraints
- Usage examples (when to use AND when NOT to use)
- Edge cases and input format requirements
- Clear boundaries from other similar tools

### Testing Tools

- Test extensively in workbench before deployment
- Watch for common model mistakes and adjust definitions
- Iterate on parameter names and descriptions for clarity
- When models consistently misuse a tool, change the interface (not just the docs)

> Anthropic's SWE-bench team spent more time optimizing tools than overall prompts. When models made mistakes with relative file paths, requiring absolute paths eliminated the issue completely.

---

## Framework Guidance

Frameworks can help with boilerplate (LLM calling, tool parsing, chaining) but:

- **They create abstraction layers** that obscure prompts and responses
- **They complicate debugging** — hard to see what tokens reach the model
- **They tempt unnecessary complexity**

**Recommendation:** Start with direct LLM API usage. Many patterns need minimal code. If using frameworks, understand the underlying code.

---

## Complexity Decision Tree

```
Can a single LLM call solve it?
├── Yes → Augmented LLM (optimize prompt + retrieval)
└── No → Are the steps predictable?
    ├── Yes → Which workflow pattern fits?
    │   ├── Sequential fixed steps → Prompt Chaining
    │   ├── Input classification → Routing
    │   ├── Independent subtasks → Parallelization
    │   ├── Dynamic subtask decomposition → Orchestrator-Workers
    │   └── Iterative refinement → Evaluator-Optimizer
    └── No → Autonomous Agent (with guardrails)
```
