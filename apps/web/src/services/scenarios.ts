import type { ConfigResponse } from '../stores/config';
export interface ScenarioPreset {
  id: string; name: string; description: string; observe: string; changes: string;
  overrides: { agent: Partial<ConfigResponse['agent']>; needs: Partial<ConfigResponse['needs']>; cooperation: Partial<ConfigResponse['cooperation']> };
}
// Starting conditions only. They do not inject decisions or guarantee outcomes.
export const SCENARIOS: ScenarioPreset[] = [
  { id: 'survival', name: 'Survival', description: 'A small reserve and ordinary needs. Watch agents balance food, rest and work.',
    observe: 'Observe consumption, sleep, health and failed actions. All existing world mechanics remain available.',
    changes: 'Each agent starts with 30 CITY, 80 hunger, 75 energy and 100 health. Hunger/energy decay: 1 / 0.5 per tick. Cooperation bonuses enabled.',
    overrides: { agent: { startingBalance: 30, startingHunger: 80, startingEnergy: 75, startingHealth: 100 }, needs: { hungerDecay: 1, energyDecay: 0.5 }, cooperation: { enabled: true } } },
  { id: 'exchange', name: 'Trade and work', description: 'More spending room to explore trade and employment with several agents.',
    observe: 'Use at least two agents to observe interactions. Inspect offers, escrow and completed payments; agents may choose other actions.',
    changes: 'Each agent starts with 100 CITY, 90 hunger, 90 energy and 100 health. Hunger/energy decay: 1 / 0.5 per tick. Cooperation bonuses enabled.',
    overrides: { agent: { startingBalance: 100, startingHunger: 90, startingEnergy: 90, startingHealth: 100 }, needs: { hungerDecay: 1, energyDecay: 0.5 }, cooperation: { enabled: true } } },
  { id: 'puzzles', name: 'Puzzle collaboration', description: 'Slower needs decay and a larger reserve leave room to join puzzles and exchange fragments.',
    observe: 'Use at least three agents. Puzzles follow the normal world lifecycle; joining, sharing and solving are choices, not scripted outcomes.',
    changes: 'Each agent starts with 100 CITY and full hunger, energy and health. Hunger/energy decay: 0.5 / 0.25 per tick. Cooperation bonuses enabled.',
    overrides: { agent: { startingBalance: 100, startingHunger: 100, startingEnergy: 100, startingHealth: 100 }, needs: { hungerDecay: 0.5, energyDecay: 0.25 }, cooperation: { enabled: true } } },
];
