// Fit actual text advances before rendering, so the suffix itself stays visible.
export function shortenChartLabel(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return text;
  const suffix = '...';
  if (measure(suffix) > maxWidth) return null;
  const chars = Array.from(text);
  let low = 0, high = chars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(chars.slice(0, middle).join('') + suffix) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return low < 2 ? null : chars.slice(0, low).join('') + suffix;
}

export function chartTextMetrics(fontSize) {
  const context = document.createElement('canvas').getContext('2d');
  if (context?.measureText) {
    context.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    const metrics = context.measureText('Mg');
    return { measure: text => context.measureText(text).width,
      ascent: metrics.actualBoundingBoxAscent || fontSize, descent: metrics.actualBoundingBoxDescent || fontSize * .25 };
  }
  return { measure: text => Array.from(text).reduce((width, char) => width + fontSize * (char.charCodeAt(0) > 255 ? 1 : .65), 0),
    ascent: fontSize, descent: fontSize * .25 };
}
