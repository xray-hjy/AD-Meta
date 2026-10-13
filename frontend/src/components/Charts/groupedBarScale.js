import { scaleLinear } from 'd3';

export function groupedBarScale(items, series, available, vertical) {
  const values = items.flatMap(item => series.map(group => item.values[group.key])).filter(Number.isFinite);
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  // Reserve room for end labels, keep zero in the domain, and use nice ticks
  // appropriate to the actual screen length rather than the camera scale.
  const ticks = Math.max(2, Math.min(8, Math.floor(available / (vertical ? 65 : 100))));
  const span = high - low;
  const domain = span ? [low < 0 ? low - span * .08 : 0, high > 0 ? high + span * .08 : 0] : [0, 1];
  const scale = scaleLinear().domain(domain).nice(ticks).range([0, available]);
  return { scale, ticks: scale.ticks(ticks), format: scale.tickFormat(ticks) };
}
