import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomeFoundation from './HomeFoundation';
import { HOME_CHAPTERS, HOME_COPY } from '../homeContent';

const copy = HOME_COPY.foundation;
const branch = key => copy.branches.find(item => item.key === key);
const trigger = key => screen.getByRole('button', { name: copy.toggleLabel(branch(key).label) });
const panel = key => document.getElementById(trigger(key).getAttribute('aria-controls'));
const renderFoundation = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><HomeFoundation /></MemoryRouter>);

test('switches analysis evidence exclusively and keeps collapsed links out of the accessible content', () => {
  renderFoundation();
  for (const item of copy.branches) {
    expect(trigger(item.key)).toHaveAttribute('aria-expanded', 'false');
    expect(panel(item.key)).toHaveAttribute('inert');
  }
  fireEvent.click(trigger('mag'));
  const evidence = screen.getByRole('region', { name: copy.detailLabel(branch('mag').label) });
  expect(within(evidence).getByRole('link', { name: copy.sourceLink })).toHaveAttribute('href', HOME_CHAPTERS.find(item => item.key === 'mag').route);
  expect(panel('mag')).not.toHaveAttribute('inert');
  fireEvent.click(trigger('species'));
  expect(trigger('mag')).toHaveAttribute('aria-expanded', 'false');
  expect(panel('mag')).toHaveAttribute('aria-hidden', 'true');
  expect(panel('mag')).toHaveAttribute('inert');
  expect(screen.queryByRole('region', { name: copy.detailLabel(branch('mag').label) })).toBeNull();
  expect(trigger('species')).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(trigger('species'));
  expect(trigger('species')).toHaveAttribute('aria-expanded', 'false');
});

test('supports branch keyboard navigation and restores focus when closing evidence with Escape', () => {
  renderFoundation();
  trigger('species').focus();
  fireEvent.keyDown(trigger('species'), { key: 'ArrowRight' });
  expect(trigger('function')).toHaveFocus();
  fireEvent.keyDown(trigger('function'), { key: 'End' });
  expect(trigger('mag')).toHaveFocus();
  fireEvent.click(trigger('mag'));
  const link = within(screen.getByRole('region', { name: copy.detailLabel(branch('mag').label) })).getByRole('link');
  link.focus();
  fireEvent.keyDown(link, { key: 'Escape' });
  expect(trigger('mag')).toHaveFocus();
  expect(trigger('mag')).toHaveAttribute('aria-expanded', 'false');
  expect(panel('mag')).toHaveAttribute('inert');
});
