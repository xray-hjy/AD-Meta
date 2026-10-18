import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ChartPanJoystick from './ChartPanJoystick';

let frames, nextId;
const canPan = { up: true, down: true, left: true, right: true };
beforeEach(() => {
  frames = new Map(); nextId = 0;
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { const id = ++nextId; frames.set(id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(id => frames.delete(id)));
  vi.spyOn(performance, 'now').mockReturnValue(0);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function tick(time) {
  const [id, callback] = frames.entries().next().value;
  frames.delete(id); act(() => callback(time));
}

test('direction clicks use navigation directions and disable movement beyond the bounds', () => {
  const onPan = vi.fn();
  render(<ChartPanJoystick onPan={onPan} panMode={false} onTogglePan={vi.fn()} canPan={{ ...canPan, left: false }} />);
  expect(screen.getByRole('button', { name: '向左平移' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '向下平移' }));
  expect(onPan).toHaveBeenCalledWith(0, 36);
});

test('holding a direction repeats until released and unmount cancels pending motion', () => {
  const onPan = vi.fn();
  const { unmount } = render(<ChartPanJoystick onPan={onPan} panMode={false} onTogglePan={vi.fn()} canPan={canPan} />);
  const right = screen.getByRole('button', { name: '向右平移' });
  fireEvent.pointerDown(right, { button: 0 });
  expect(onPan).toHaveBeenLastCalledWith(36, 0);
  tick(100); expect(onPan).toHaveBeenCalledTimes(1);
  tick(200); expect(onPan).toHaveBeenLastCalledWith(36, 0);
  fireEvent.pointerUp(right);
  expect(frames.size).toBe(0);
  fireEvent.pointerDown(right, { button: 0 });
  unmount(); expect(frames.size).toBe(0);
});

test('dragging the stick pans diagonally and releasing recenters without toggling drag mode', () => {
  const onPan = vi.fn(), onTogglePan = vi.fn();
  render(<ChartPanJoystick onPan={onPan} panMode={false} onTogglePan={onTogglePan} canPan={canPan} />);
  const thumb = screen.getByRole('button', { name: '图内拖动模式' });
  fireEvent.pointerDown(thumb, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(thumb, { clientX: 118, clientY: 118 });
  tick(40);
  expect(onPan.mock.lastCall[0]).toBeGreaterThan(0);
  expect(onPan.mock.lastCall[1]).toBeGreaterThan(0);
  fireEvent.pointerUp(thumb);
  expect(onTogglePan).not.toHaveBeenCalled();
  expect(thumb.style.transform).toBe('translate(0px, 0px)');
  expect(frames.size).toBe(0);
  fireEvent.pointerDown(thumb, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(thumb);
  expect(onTogglePan).toHaveBeenCalledTimes(1);
});

test('loss of window focus stops a held control', () => {
  render(<ChartPanJoystick onPan={vi.fn()} panMode={false} onTogglePan={vi.fn()} canPan={canPan} />);
  fireEvent.pointerDown(screen.getByRole('button', { name: '向上平移' }), { button: 0 });
  fireEvent.blur(window);
  expect(frames.size).toBe(0);
});

test('hiding the navigation panel stops held movement and preserves drag mode', () => {
  const onPan = vi.fn(), onTogglePan = vi.fn();
  const props = { onPan, onTogglePan, panMode: true, canPan };
  const { rerender } = render(<ChartPanJoystick {...props} />);
  fireEvent.pointerDown(screen.getByRole('button', { name: '向右平移' }), { button: 0 });
  expect(frames.size).toBe(1);
  rerender(<ChartPanJoystick {...props} enabled={false} />);
  expect(frames.size).toBe(0);
  expect(screen.getByRole('button', { name: '图内拖动模式' })).toBeDisabled();
  expect(onTogglePan).not.toHaveBeenCalled();
  rerender(<ChartPanJoystick {...props} enabled />);
  expect(screen.getByRole('button', { name: '图内拖动模式' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '向右平移' })).toBeEnabled();
});

test('frequent stick moves preserve elapsed frame time and full speed', () => {
  const onPan = vi.fn();
  render(<ChartPanJoystick onPan={onPan} panMode={false} onTogglePan={vi.fn()} canPan={canPan} />);
  const thumb = screen.getByRole('button', { name: '图内拖动模式' });
  fireEvent.pointerDown(thumb, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(thumb, { clientX: 100, clientY: 118 });
  tick(16);
  expect(onPan).toHaveBeenLastCalledWith(0, 14.4);
  performance.now.mockReturnValue(31);
  fireEvent.pointerMove(thumb, { clientX: 100, clientY: 120 });
  tick(32);
  // The entire 16 ms frame counts, even though the last pointer move was 1 ms ago.
  expect(onPan).toHaveBeenLastCalledWith(0, 14.4);
  fireEvent.pointerUp(thumb);
});

test('geometry changes update a held stick without restarting its frame clock', () => {
  const onPan = vi.fn(), props = { onPan, panMode: false, onTogglePan: vi.fn(), canPan,
    world: { width: 1000, height: 30000 }, visible: { width: 1000, height: 500 }, viewport: { width: 1000, height: 500 } };
  const { rerender } = render(<ChartPanJoystick {...props} />);
  const thumb = screen.getByRole('button', { name: '图内拖动模式' });
  fireEvent.pointerDown(thumb, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(thumb, { clientX: 100, clientY: 118 });
  tick(600); const initial = onPan.mock.lastCall[1];
  expect(initial).toBeGreaterThan(36);
  rerender(<ChartPanJoystick {...props} visible={{ width: 1000, height: 250 }} />);
  tick(640);
  expect(onPan.mock.lastCall[1]).toBeGreaterThan(initial * 1.9);
  expect(onPan.mock.lastCall[0]).toBe(0);
  fireEvent.pointerUp(thumb); expect(frames.size).toBe(0);
});
