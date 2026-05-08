import type { Plugin } from "@opencode-ai/plugin"

/**
 * OpenCode plugin that preserves critical implementation-stage instructions
 * across context compaction events.
 *
 * When OpenCode compacts the conversation history (due to context window limits),
 * the detailed implementer prompt can be lost. This plugin injects the core
 * instruction back into the compaction summary, ensuring the agent continues
 * to work in small, focused increments rather than tackling vague big goals.
 */
export const PreserveInstructions: Plugin = async () => {
  return {
    "experimental.session.compacting": async (_input, output) => {
      output.context.push(`## CRITICAL WORKFLOW INSTRUCTION (PRESERVED ACROSS COMPACTION)

You are currently in the IMPLEMENTATION stage.

Your mandate:
1. Identify ONE small incremental task that moves toward the goal
2. Implement that single task only — nothing more, nothing less
3. Do NOT tackle vague big goals as a whole
4. Do NOT try to complete multiple tasks at once
5. Focus on the most logical next small step given what has already been done

If you find yourself planning or thinking about the big picture, STOP.
Pick one concrete, small task and implement it.

This instruction must survive all context compaction events.
`)
    },
  }
}

export default PreserveInstructions
