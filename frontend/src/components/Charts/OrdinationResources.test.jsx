import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import OrdinationResources from './OrdinationResources';

test('lazily renders and paginates large ordination resources', async () => {
  const rows = Array.from({ length: 605 }, (_, index) => ({
    sample: `S${index + 1}`,
    group: index % 2 ? 'AD' : 'NC',
    distanceToGroupCentroid: index / 100,
  }));
  render(
    <OrdinationResources
      data={{ method: 'PCoA', resources: { dispersionDistances: rows } }}
    />,
  );

  expect(screen.queryByRole('region', { name: /样本到组质心的距离/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('样本到组质心的距离（605 项）'));

  expect(await screen.findByRole('region', { name: /样本到组质心的距离/ })).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(301);
  expect(screen.getByRole('region', { name: /样本到组质心的距离/ })).toHaveAttribute('data-visible-rows', '20');
  fireEvent.click(screen.getByRole('button', { name: '第 3 页' }));
  expect(screen.getAllByRole('row')).toHaveLength(6);
  expect(screen.getByText('S605')).toBeInTheDocument();
});
