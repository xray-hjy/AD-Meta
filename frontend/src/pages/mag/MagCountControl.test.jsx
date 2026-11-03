import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MagCountControl from './MagCountControl';

it('validates small counts and confirms all without submitting the surrounding form', async () => {
  const onChange = vi.fn(), submit = vi.fn(e => e.preventDefault());
  render(<form onSubmit={submit}><MagCountControl value={40} max={872} onChange={onChange} /></form>);
  fireEvent.click(screen.getByRole('button', { name: '展示MAG数量', exact: true }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: '展示MAG数量' }), { target: { value: '0' } });
  expect(within(dialog).getByRole('button', { name: '确认数量' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: '3', exact: true }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: '全部匹配', exact: true }));
  fireEvent.click(within(dialog).getByRole('button', { name: '确认数量' }));
  expect(onChange).toHaveBeenCalledWith(872);
  expect(submit).not.toHaveBeenCalled();
});
