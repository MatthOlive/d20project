import { rollD6 } from "@/lib/pokerole";
import type { EngineRulePack, EngineSystemId } from "@/lib/game-engine/types";

const pokeroleRules: EngineRulePack = {
  id: "pokerole",
  label: "Pokérole 2.0",
  initiativeLabel: "Dexterity + Alert",
  actionTypes: [
    { id: "move", label: "Move" },
    { id: "maneuver", label: "Manobra" },
    { id: "item", label: "Item" },
    { id: "reaction", label: "Reação" },
    { id: "other", label: "Outra" },
  ],
  rollInitiative(participant) {
    const pool = Math.max(0, participant.initiativePool);
    const result = rollD6(pool);
    return {
      value: result.successes,
      label: `${pool}d6 · ${result.successes} sucesso(s)`,
      detail: { pool, dice: result.dice, successes: result.successes, ones: result.ones },
    };
  },
  actionHint(participant) {
    return `Próxima ação: ${participant.actionsUsed + 1} sucesso(s) necessário(s).`;
  },
};

const t20Rules: EngineRulePack = {
  id: "t20",
  label: "Tormenta 20",
  initiativeLabel: "1d20 + Iniciativa",
  actionTypes: [
    { id: "standard", label: "Ação padrão" },
    { id: "move", label: "Ação de movimento" },
    { id: "full", label: "Ação completa" },
    { id: "free", label: "Ação livre" },
    { id: "reaction", label: "Reação" },
  ],
  rollInitiative(participant) {
    const die = Math.floor(Math.random() * 20) + 1;
    const modifier = participant.initiativeModifier;
    return {
      value: die + modifier,
      label: `1d20 (${die}) ${modifier >= 0 ? "+" : "−"} ${Math.abs(modifier)} = ${die + modifier}`,
      detail: { die, modifier, total: die + modifier },
    };
  },
  actionHint(participant) {
    if (participant.actionsUsed === 0) return "Nenhuma ação registrada neste turno.";
    return `${participant.actionsUsed} ação(ões) registrada(s) neste turno.`;
  },
};

const lancerRules: EngineRulePack = {
  id: "lancer",
  label: "LANCER",
  initiativeLabel: "Ativações alternadas",
  actionTypes: [
    { id: "move", label: "Move" },
    { id: "quick", label: "Quick Action" },
    { id: "full", label: "Full Action" },
    { id: "protocol", label: "Protocol" },
    { id: "reaction", label: "Reaction" },
    { id: "free", label: "Free Action" },
  ],
  rollInitiative() {
    return {
      value: 0,
      label: "LANCER não usa iniciativa fixa.",
      detail: { activationModel: "alternating" },
    };
  },
  actionHint(participant) {
    if (participant.actionsUsed === 0) return "Ativação disponível.";
    return `${participant.actionsUsed} ação(ões) registrada(s) nesta ativação.`;
  },
};

const genericRules: EngineRulePack = {
  ...t20Rules,
  id: "generic",
  label: "Sistema genérico",
};

export function getEngineRulePack(systemId: EngineSystemId): EngineRulePack {
  if (systemId === "pokerole") return pokeroleRules;
  if (systemId === "t20") return t20Rules;
  if (systemId === "lancer") return lancerRules;
  return { ...genericRules, id: systemId };
}
