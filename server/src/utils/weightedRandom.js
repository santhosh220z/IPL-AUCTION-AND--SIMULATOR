export function pickWeightedOutcome(weightMap) {
  const entries = Object.entries(weightMap).filter(([, weight]) => Number(weight) > 0);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);

  if (!entries.length || totalWeight <= 0) {
    return null;
  }

  const random = Math.random() * totalWeight;
  let cumulative = 0;

  for (const [value, weight] of entries) {
    cumulative += Number(weight);
    if (random <= cumulative) {
      return value;
    }
  }

  return entries[entries.length - 1][0];
}
