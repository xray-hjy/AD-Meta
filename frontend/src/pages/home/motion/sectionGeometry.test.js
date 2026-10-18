import { selectSectionSnap } from './sectionGeometry';

const sections = [
  { id: 'hero', snap: 'start', start: 0, end: 0 },
  { id: 'showcase', snap: 'managed', managed: true, start: 1000, end: 6000 },
  { id: 'foundation', snap: 'start', start: 7000, end: 7600 },
];

test('approaches the gallery at its first stop forward and final stop backward', () => {
  expect(selectSectionSnap(sections, 820, 1, 250)).toMatchObject({ id: 'showcase', top: 1000 });
  expect(selectSectionSnap(sections, 6200, -1, 250)).toMatchObject({ id: 'showcase', top: 6000 });
  expect(selectSectionSnap(sections, 3000, 1, 250)).toBeNull();
});

test('long content stays freely readable and only approaches its boundaries', () => {
  expect(selectSectionSnap(sections, 7300, 1, 250)).toBeNull();
  expect(selectSectionSnap(sections, 7450, 1, 250)).toMatchObject({ top: 7600 });
  expect(selectSectionSnap(sections, 7080, 1, 250)).toBeNull();
  expect(selectSectionSnap(sections, 6980, 1, 250)).toMatchObject({ top: 7000 });
});

test('arbitrary additional and opted-out sections need no controller changes', () => {
  const extra = [...sections, { id: 'cases', snap: 'start', start: 9000, end: 9000 }, { id: 'notes', snap: 'none', start: 10000, end: 10000 }];
  expect(selectSectionSnap(extra, 8810, 1, 250)).toMatchObject({ id: 'cases' });
  expect(selectSectionSnap(extra, 9820, 1, 250)).toBeNull();
});
