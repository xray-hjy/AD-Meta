import { createSectionRegistry } from './createSectionRegistry';

test('registration follows live DOM order and supports insertion, removal and remounting', () => {
  const registry = createSectionRegistry(), listener = vi.fn();
  const root = document.createElement('main');
  root.innerHTML = '<section></section><section></section><section></section><section></section><section></section>';
  document.body.append(root);
  const unsubscribe = registry.subscribe(listener);
  const cleanup = [...root.children].reverse().map((element, index) => registry.register({ id: String(index), element }));
  expect(registry.sections().map(entry => entry.element)).toEqual([...root.children]);
  root.prepend(root.lastElementChild);
  expect(registry.sections()[0].id).toBe('0');
  cleanup[0]();
  expect(registry.sections()).toHaveLength(4);
  expect(() => registry.register(registry.sections()[0])).toThrow('Duplicate home section');
  expect(listener).toHaveBeenCalledTimes(6);
  cleanup.slice(1).forEach(dispose => dispose());
  const remove = registry.register({ id: '0', element: root.firstElementChild });
  expect(registry.sections()).toHaveLength(1);
  unsubscribe(); remove(); root.remove();
});

test('reordering mounted siblings notifies coordinators without observing nested galleries', async () => {
  const registry = createSectionRegistry(), root = document.createElement('main');
  root.innerHTML = '<div><span></span></div><div></div>';
  document.body.append(root);
  const removers = [...root.children].map((element, index) => registry.register({ id: String(index), element }));
  const listener = vi.fn(), unsubscribe = registry.subscribe(listener);
  root.firstElementChild.append(document.createElement('img'));
  await Promise.resolve(); expect(listener).not.toHaveBeenCalled();
  root.prepend(root.lastElementChild);
  await Promise.resolve(); expect(listener).toHaveBeenCalledOnce();
  expect(registry.sections()[0].id).toBe('1');
  unsubscribe(); removers.forEach(remove => remove()); root.remove();
});
