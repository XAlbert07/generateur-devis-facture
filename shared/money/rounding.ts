/**
 * Arrondit a × b / c à l'entier le plus proche, avec les moitiés vers le haut.
 * Les facteurs restent distincts pour ne jamais perdre de précision.
 */
export function roundHalfUpDiv(a: bigint, b: bigint, c: bigint): bigint {
  if (a < 0n || b < 0n || c <= 0n) {
    throw new RangeError('roundHalfUpDiv attend a, b >= 0 et c > 0');
  }

  return (2n * a * b + c) / (2n * c);
}
