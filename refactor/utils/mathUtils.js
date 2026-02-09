function clampNumber(value, min, max) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return min;
  }
  return Math.min(Math.max(numberValue, min), max);
}

function computePixelsPerInch(resolution, diagonal) {
  if (!resolution || !resolution.w || !resolution.h || !diagonal) {
    return 52.45;
  }

  const pixelDiagonal = Math.sqrt((resolution.w ** 2) + (resolution.h ** 2));
  return Number((pixelDiagonal / diagonal).toFixed(2));
}

module.exports = {
  clampNumber,
  computePixelsPerInch
};
