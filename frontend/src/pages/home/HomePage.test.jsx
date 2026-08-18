import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';

test('presents the community analysis domains and planned extensions', () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <HomePage />
    </MemoryRouter>
  );

  expect(screen.getByRole('link', { name: '微脑智库首页' })).toBeTruthy();
  expect(screen.getByText('微脑智库')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1, name: 'AD-Meta' })).toBeTruthy();
  expect(screen.getByText('面向 AD 脑肠轴研究的肠道宏基因组研发辅助工具')).toBeTruthy();
  expect(screen.getByRole('heading', { name: '围绕脑肠轴研究问题，逐步展开分析' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: '从原始测序数据到可分析结果' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /进入群落分析/ }).getAttribute('href')).toBe('/analysis/abundance');
  expect(screen.getByText('群落物种')).toBeTruthy();
  expect(screen.getByText('群落功能')).toBeTruthy();
  expect(screen.getByText('物种-功能联合')).toBeTruthy();
  expect(screen.getByText('MAG 解析')).toBeTruthy();
  expect(screen.getByText('Sample × Species')).toBeTruthy();
  expect(screen.getByText('Sample × KO')).toBeTruthy();
  expect(screen.getByText('Raw FASTQ')).toBeTruthy();
  expect(screen.getByText('Coverage 计算')).toBeTruthy();
  expect(screen.getByText(/Final MAGs/)).toBeTruthy();
});
