import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EvidenceLink, { EvidenceContext, safeAnalysisReturn } from './EvidenceLink';

test('links the selected stable object with its exact revision, original chart and scope', () => {
  render(<MemoryRouter initialEntries={['/analysis/abundance?run=r1&chart=boxplot&group=AD']}>
    <EvidenceContext.Provider value={{ sourceRevision: 'fixed-v1', datasetSlug: 'ad-nc-species', runKey: 'r1', artifactKey: 'species', sourceChart: 'boxplot', scope: { group: 'AD' } }}>
      <EvidenceLink subjectId="123" />
    </EvidenceContext.Provider>
  </MemoryRouter>);
  const url = new URL(screen.getByRole('link', { name: '外部证据评估' }).getAttribute('href'), 'http://localhost');
  expect(url.searchParams.get('subjectId')).toBe('123');
  expect(url.searchParams.get('sourceRevision')).toBe('fixed-v1');
  expect(url.searchParams.get('returnTo')).toBe('/analysis/abundance?run=r1&chart=boxplot&group=AD');
  expect(JSON.parse(url.searchParams.get('sourceScope'))).toEqual({ group: 'AD' });
});

test('has no unversioned link and rejects external return destinations', () => {
  render(<MemoryRouter><EvidenceLink subjectId="123" /></MemoryRouter>);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(safeAnalysisReturn('//evil.test/analysis/abundance')).toBe('/analysis/abundance');
  expect(safeAnalysisReturn('https://evil.test')).toBe('/analysis/abundance');
  expect(safeAnalysisReturn('/analysis/abundance\\evil')).toBe('/analysis/abundance');
});
