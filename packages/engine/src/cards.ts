export type Card = string; // e.g. "As", "Td" — rank char + suit char

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

export function newDeck(): Card[] {
  const d: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
}

export const rankValue = (c: Card): number => RANKS.indexOf(c[0]) + 2;

export function isCard(x: unknown): x is Card {
  return typeof x === 'string' && x.length === 2 && RANKS.includes(x[0]) && SUITS.includes(x[1]);
}

const RANK_NAME: Record<number, [string, string]> = {
  2: ['Two', 'Twos'], 3: ['Three', 'Threes'], 4: ['Four', 'Fours'], 5: ['Five', 'Fives'], 6: ['Six', 'Sixes'],
  7: ['Seven', 'Sevens'], 8: ['Eight', 'Eights'], 9: ['Nine', 'Nines'], 10: ['Ten', 'Tens'], 11: ['Jack', 'Jacks'],
  12: ['Queen', 'Queens'], 13: ['King', 'Kings'], 14: ['Ace', 'Aces'],
};
export const rankName = (v: number, plural = false) => RANK_NAME[v][plural ? 1 : 0];
