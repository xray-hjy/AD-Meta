import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import StyledSelect from './StyledSelect';

test('themed select commits string values and renders its menu outside a clipping form', async () => {
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState('');
    return <form style={{ overflow: 'hidden' }}><label>疾病分组<StyledSelect name="disease" value={value}
      onChange={event => { changed(event.target.value); setValue(event.target.value); }}>
      <option value="">AD + NC</option><option>AD</option><option>NC</option>
    </StyledSelect></label></form>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('combobox', { name: /疾病分组/ }));
  const nc = await screen.findByRole('option', { name: 'NC', exact: true });
  fireEvent.pointerDown(nc, { pointerType: 'mouse', button: 0 });
  fireEvent.click(nc);
  expect(changed).toHaveBeenCalledExactlyOnceWith('NC');
  expect(screen.getByRole('combobox', { name: /疾病分组/ })).toHaveTextContent('NC');
  fireEvent.click(screen.getByRole('combobox', { name: /疾病分组/ }));
  const option = await screen.findByRole('option', { name: 'AD', exact: true });
  expect(option.closest('form')).toBeNull();
  fireEvent.keyDown(option, { key: 'Escape' });
  expect(changed).toHaveBeenCalledTimes(1);
});

test('disabled select and disabled menu items cannot change selection', async () => {
  const changed = vi.fn();
  const mounted = render(<StyledSelect aria-label="排序" value="mean" disabled onChange={changed}><option value="mean">均值</option></StyledSelect>);
  expect(screen.getByRole('combobox', { name: '排序' })).toBeDisabled();
  mounted.rerender(<StyledSelect aria-label="排序" value="mean" onChange={changed}>
    <option value="mean">均值</option><option value="q" disabled>q 值</option></StyledSelect>);
  fireEvent.click(screen.getByRole('combobox', { name: '排序' }));
  fireEvent.click(await screen.findByRole('option', { name: 'q 值' }));
  expect(changed).not.toHaveBeenCalled();
});
