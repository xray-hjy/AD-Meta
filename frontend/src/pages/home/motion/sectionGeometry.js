import { clamp } from './motionConfig';

// Read geometry in a batch. Adapters return absolute document scroll positions.
export function measureHomeSections(registry, page) {
  const header = page.querySelector('.site-header');
  const offset = (header?.getBoundingClientRect().height || 0) + 24;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  return registry.sections().map(entry => {
    const anchor = entry.anchor?.(entry.element) || entry.element;
    const rect = anchor.getBoundingClientRect();
    const top = rect.top + scrollY, bottom = rect.bottom + scrollY;
    const stops = entry.adapter?.getStops?.();
    const start = clamp(stops?.start ?? top - offset, 0, maxScroll);
    const end = clamp(stops?.end ?? Math.max(start, bottom - innerHeight), start, maxScroll);
    return { ...entry, top, bottom, height: rect.height, start, end, managed: Boolean(stops) };
  });
}

export function selectSectionSnap(sections, position, direction, radius) {
  // A managed area owns its entire reading range, not just its wheel events.
  if (sections.some(section => section.managed && position >= section.start && position <= section.end)) return null;
  const candidates = sections.flatMap(section => {
    if (section.snap === 'none') return [];
    const stops = section.managed
      ? [direction < 0 ? section.end : section.start]
      : section.end - section.start > 96 ? [section.start, section.end] : [section.start];
    return stops.map(top => ({ id: section.id, top, distance: Math.abs(top - position) }));
  }).filter(point => point.distance > 2 && point.distance <= radius && (!direction || (point.top - position) * direction >= -24));
  return candidates.sort((a, b) => a.distance - b.distance)[0] || null;
}
