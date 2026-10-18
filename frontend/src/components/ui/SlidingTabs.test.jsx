import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import SlidingTabs from './SlidingTabs';

test('tab navigation skips disabled entries and activates once with a single tab stop', () => {
  const changed = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState('a');
    return <SlidingTabs aria-label="详情">{['a', 'b', 'c'].map(key => <button key={key} role="tab" type="button"
      disabled={key === 'b'} aria-selected={key === selected} onClick={() => { changed(key); setSelected(key); }}>{key}</button>)}</SlidingTabs>;
  }
  render(<Harness />);
  const first = screen.getByRole('tab', { name: 'a' });
  first.focus();
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  const last = screen.getByRole('tab', { name: 'c' });
  expect(last).toHaveFocus();
  expect(last).toHaveAttribute('tabindex', '0');
  expect(first).toHaveAttribute('tabindex', '-1');
  expect(changed).toHaveBeenCalledExactlyOnceWith('c');
  fireEvent.keyDown(last, { key: 'Home' });
  expect(first).toHaveFocus();
});

test('a tab with its existing keyboard policy does not activate a second time', () => {
  const select = vi.fn();
  render(<SlidingTabs><button role="tab" aria-selected onKeyDown={event => { event.preventDefault(); select('existing'); }}>详情</button></SlidingTabs>);
  fireEvent.keyDown(screen.getByRole('tab'), { key: 'ArrowRight' });
  expect(select).toHaveBeenCalledExactlyOnceWith('existing');
});
