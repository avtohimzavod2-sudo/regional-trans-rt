// Registry of every RT AI Workforce agent's contract, for introspection and
// the dispatcher's "system health / agent audit" UI. Add a new agent here
// the moment its contract is defined so it shows up without extra wiring.
import type { AgentContract } from "./types";
import { COMMAND_AGENT_CONTRACT } from "./command";
import { PASSENGER_AGENT_CONTRACT } from "./passenger";
import { DRIVER_AGENT_CONTRACT } from "./driver";
import { MATCH_AGENT_CONTRACT } from "./match";
import { ROUTE_AGENT_CONTRACT } from "./route";
import { TRUST_AGENT_CONTRACT } from "./trust";
import { PAY_AGENT_CONTRACT } from "./pay";
import { SUPPORT_AGENT_CONTRACT } from "./support";
import { PARCEL_AGENT_CONTRACT } from "./parcel";
import { SCOUT_AGENT_CONTRACT } from "./scout";
import { QUALITY_AGENT_CONTRACT } from "./quality";
import { ANALYTICS_AGENT_CONTRACT } from "./analytics";
import { NETWORK_AGENT_CONTRACT } from "./network";

export const AGENT_REGISTRY: AgentContract[] = [
  COMMAND_AGENT_CONTRACT,
  PASSENGER_AGENT_CONTRACT,
  DRIVER_AGENT_CONTRACT,
  MATCH_AGENT_CONTRACT,
  ROUTE_AGENT_CONTRACT,
  TRUST_AGENT_CONTRACT,
  PAY_AGENT_CONTRACT,
  SUPPORT_AGENT_CONTRACT,
  PARCEL_AGENT_CONTRACT,
  SCOUT_AGENT_CONTRACT,
  QUALITY_AGENT_CONTRACT,
  ANALYTICS_AGENT_CONTRACT,
  NETWORK_AGENT_CONTRACT,
];

export function getAgentContract(name: string): AgentContract | undefined {
  return AGENT_REGISTRY.find((c) => c.name === name);
}
