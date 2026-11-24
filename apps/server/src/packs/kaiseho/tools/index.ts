import { PHASE0_TOOLS } from "./agentTools";
import { PHASE1_TOOLS } from "./moreTools";

/** All /mcp/agent tools (plan.md Section 10.1). */
export const AGENT_TOOLS = { ...PHASE0_TOOLS, ...PHASE1_TOOLS };
