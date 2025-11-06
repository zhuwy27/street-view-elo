// src/elo.ts
export function calculateElo(R1: number, R2: number, K: number, result: number) {
  // result: 1 => R1 胜, 0 => R2 胜, 0.5 => 平局
  const E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
  const E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
  const newR1 = R1 + K * (result - E1);
  const newR2 = R2 + K * ((1 - result) - E2);
  return [newR1, newR2];
}
