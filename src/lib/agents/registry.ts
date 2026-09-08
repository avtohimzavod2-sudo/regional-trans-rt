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
import { MIRA_AGENT_CONTRACT } from "@/lib/mira/orchestrator";
import { JOLCHU_AGENT_CONTRACT } from "@/lib/jolchu/orchestrator";
import { SAPAR_AGENT_CONTRACT } from "@/lib/sapar/orchestrator";
import { SAPARGUL_AGENT_CONTRACT } from "@/lib/sapargul/orchestrator";
import { ADILET_AGENT_CONTRACT } from "@/lib/adilet/orchestrator";
import { TYYIN_AGENT_CONTRACT } from "@/lib/tyyin/orchestrator";
import { ARTUR_AGENT_CONTRACT } from "@/lib/artur/orchestrator";
import { RT_OFFICE_AGENT_CONTRACT } from "@/lib/rt-office/orchestrator";
import { CRM_AUTO_AGENT_CONTRACT } from "@/lib/crm-auto/orchestrator";

export const AGENT_REGISTRY: AgentContract[] = [
  MIRA_AGENT_CONTRACT,
  JOLCHU_AGENT_CONTRACT,
  SAPAR_AGENT_CONTRACT,
  SAPARGUL_AGENT_CONTRACT,
  ADILET_AGENT_CONTRACT,
  TYYIN_AGENT_CONTRACT,
  ARTUR_AGENT_CONTRACT,
  RT_OFFICE_AGENT_CONTRACT,
  CRM_AUTO_AGENT_CONTRACT,
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
