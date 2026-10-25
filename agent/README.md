# Bring-your-own agent: Claude Code, headless

The organisers allow any agent. This one is Claude Code run with `claude -p`,
because failproofai hooks plug into it directly, the kit's policies read its
transcripts, and `pass3.mjs` parses its JSON output. Every lever is a file here.

| Lever | Where |
|---|---|
| System prompt | `AGENT_PROMPT.md` (appended to Claude Code's own) |
| Model, turn cap, allowed tools | env vars in `run.sh` |
| The organisers' tools | `.mcp.json` (copy from `mcp.example.json`) |
| Guardrails | failproofai policies from `../policies` |

## Setup (in WSL)

**Copy this folder out of the kit first.** Claude Code loads every `CLAUDE.md`
in the run directory and its parents, so running it inside the kit would feed
the agent the kit's hackathon notes (noise, cost and drift).

```bash
cp -R agent ~/hack-agent && cd ~/hack-agent && chmod +x run.sh
mkdir -p .failproofai && cp -R ~/hacktober-hack-kit/policies ~/hacktober-hack-kit/lib .failproofai/
failproofai policies --install --custom .failproofai/policies/reliability-policies.mjs --scope project
failproofai policies                       # all kit-* policies listed?
PROMPT="What is 17 * 23? Reply with only the number." ./run.sh
```

Then plug in what the organisers give you:
1. **Tools:** `cp mcp.example.json .mcp.json`, fill in their server, and add `mcp__tools` to `ALLOWED_TOOLS`.
2. **Limits:** set `MAX_TURNS` below the call limit and `FP_CALL_BUDGET` to it, then pass the same limits to pass3 (`--max-turns --max-tokens --max-seconds`).
3. **Model:** set `MODEL` if they require one.

## Loop

```bash
node ~/hacktober-hack-kit/eval/pass3.mjs --tasks tasks.json --label baseline --cwd . --cmd ./run.sh -k 3
node ~/hacktober-hack-kit/eval/triage.mjs ~/hacktober-hack-kit/results/baseline.json
# fix the top category: prompt -> AGENT_PROMPT.md, hard rule -> a policy
node ~/hacktober-hack-kit/eval/pass3.mjs --tasks tasks.json --label v1 --cwd . --cmd ./run.sh --compare ~/hacktober-hack-kit/results/baseline.json
```

For the 20 eval points, "baseline" should be **this agent with no policies and
no `AGENT_PROMPT.md`** (`--append-system-prompt ""`); confirm with the
organisers what they will run as the baseline.

## Ask the organisers at kickoff
- Is the model fixed, and which one? Do we have to use their key?
- What are the exact call, time and token limits, and how are they counted?
- How is the hidden suite run against our agent: what command, from which folder, with which tools?
- What counts as "baseline" for the eval points if every team brings a different agent?
