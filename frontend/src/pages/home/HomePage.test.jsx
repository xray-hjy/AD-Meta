import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';

test('presents the abundance workspace as the primary platform entry', () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <HomePage />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { level: 1, name: 'AD-Meta' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /进入丰度分析/ }).getAttribute('href')).toBe('/analysis/abundance');
  expect(screen.getByText('物种丰度')).toBeTruthy();
  expect(screen.getByText('KO 功能丰度')).toBeTruthy();
});
