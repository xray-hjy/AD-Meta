import { fireEvent, screen } from '@testing-library/react';

// Base UI distinguishes a real item press from a click generated on the trigger.
export function selectOption(trigger, value) {
  fireEvent.click(trigger);
  const option = screen.getAllByRole('option').find(item => item.dataset.selectValue === String(value));
  if (!option) throw new Error(`Select option not found: ${value}`);
  fireEvent.pointerDown(option, { pointerType: 'mouse', button: 0 });
  fireEvent.click(option);
}
