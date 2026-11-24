import { createRef } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import MagPhylogenySurface from './MagPhylogenySurface';
import { PRESENCE_PALETTES } from './magPresencePalette';
import {
  PHYLOGENY_LEAF_INSET_END, PHYLOGENY_LEAF_INSET_START, buildPhylogenyModel,
  phylogenyBranchPath, phylogenyGeometry, phylogenyMinLeafSpacing, phylogenyPreview,
} from './magPhylogenySurfaceModel';

const data = {
  tree: { children: [{ branchLength: .13, children: [
    { name: 'M1', branchLength: .11 }, { name: 'M2', branchLength: .04 },
  ] }, { name: 'M3', branchLength: .31 }] },
  matrix: {
    mags: [{ magId: 'M3' }, { magId: 'M1', quality: { completenessPercent: 99, contaminationPercent: 2 } }, { magId: 'M2' }],
    features: [{ featureId: 'K00001' }], values: [[null], [12], [0]],
  },
};

describe('MAG phylogeny surface', () => {
  const model = buildPhylogenyModel(data, 'length');
  const inset = PHYLOGENY_LEAF_INSET_START + PHYLOGENY_LEAF_INSET_END;

  it('retains Newick leaf order, branch lengths and track data through styles and transposition', () => {
    const geometry = phylogenyGeometry(model, { width: 1000, height: 200 });
    const vertical = phylogenyGeometry(model, { width: 200, height: 1000, transposed: true });
    expect(model.leaves.map(leaf => leaf.magId)).toEqual(['M1', 'M2', 'M3']);
    expect(model.leaves.map(leaf => leaf.values)).toEqual([[99, 2, 12], [null, null, 0], [null, null, null]]);
    expect(model.branches).toHaveLength(4);
    expect(model.leaves[0].coordinate).toBeCloseTo(.24);
    expect(model.leaves[2].coordinate).toBeCloseTo(.31);
    expect((geometry.progressAxis(.24) - geometry.progressAxis(0)) / (geometry.treeEnd - geometry.progressStart)).toBeCloseTo(.24 / .31);
    expect(phylogenyBranchPath(model, geometry, 'rounded')).toMatch(/A\d/);
    expect(phylogenyBranchPath(model, geometry, 'right-angle')).not.toMatch(/A/);
    expect(phylogenyBranchPath(model, geometry, 'diagonal').match(/L/g)).toHaveLength(4);
    expect(geometry.leafAxis(1)).toBe(vertical.leafAxis(1));
    expect(vertical.xy(15, 20)).toEqual([20, 15]);
    expect(phylogenyPreview(model, { ...vertical, leafColor: 'amber', presencePalette: 'dark-brick' })).toContain('%23AD7B36');
  });

  it('keeps compact labels hidden and restores all labels at the measured readable spacing', () => {
    const ref = createRef(), width = 1000;
    const { rerender } = render(<MagPhylogenySurface {...{ model, width, ref }} height={inset + 6} />);
    expect(ref.current).toHaveAttribute('data-leaf-spacing', '2');
    expect(ref.current.querySelectorAll('[data-phylogeny-leaf-label]')).toHaveLength(0);
    expect(ref.current.querySelector('[data-phylogeny-track-titles]')).toHaveTextContent('K00001');
    const height = inset + model.leaves.length * phylogenyMinLeafSpacing(13);
    rerender(<MagPhylogenySurface {...{ model, width, height, ref }} fontSize={13} />);
    expect(ref.current.querySelectorAll('[data-phylogeny-leaf-label]')).toHaveLength(3);
    expect(ref.current.querySelector('[data-phylogeny-scale]')).toHaveAttribute('data-max', '0.31');
  });

  it('uses same row coordinates and KO glyph rules in both directions and selects the underlying record', () => {
    const ref = createRef(), onSelect = vi.fn();
    const { rerender } = render(<MagPhylogenySurface {...{ model, ref, onSelect }} width={1000} height={199} />);
    const ko = id => ref.current.querySelector(`[data-phylogeny-cell][data-mag-id="${id}"][data-track-role="function"]`);
    const leaf = id => ref.current.querySelector(`[data-phylogeny-leaf][data-mag-id="${id}"]`);
    const rect = ko('M2').querySelector('rect'), outline = ko('M2').querySelector('[data-phylogeny-zero-outline]');
    expect(ko('M1')).toHaveAttribute('data-track-state', 'hit');
    expect(ko('M1').querySelector('title')).toHaveTextContent('原始注释基因计数 12');
    expect(ko('M2')).toHaveAttribute('data-track-state', 'zero');
    expect(ko('M3')).toHaveAttribute('data-track-state', 'missing');
    expect(ko('M3').querySelector('rect[fill^="url(#"]')).toBeTruthy();
    expect(Number(outline.getAttribute('x')) - Number(rect.getAttribute('x')))
      .toBeCloseTo(Number(outline.getAttribute('y')) - Number(rect.getAttribute('y')));
    expect(Number(outline.getAttribute('stroke-width'))).toBe(2);
    expect(Number(leaf('M2').querySelector('circle').getAttribute('cy')))
      .toBeCloseTo(Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2);
    fireEvent.click(rect);
    expect(onSelect).toHaveBeenLastCalledWith({ magId: 'M2', featureId: 'K00001', name: 'K00001', role: 'function', rawCount: 0 });
    rerender(<MagPhylogenySurface {...{ model, ref, onSelect }} width={199} height={590} transposed leafColor="rose" presencePalette="dark-navy" />);
    const transposedRect = ko('M2').querySelector('rect');
    expect(Number(leaf('M2').querySelector('circle').getAttribute('cx')))
      .toBeCloseTo(Number(transposedRect.getAttribute('x')) + Number(transposedRect.getAttribute('width')) / 2);
    expect(leaf('M2').querySelector('circle')).toHaveAttribute('fill', '#AB6687');
    const expected = PRESENCE_PALETTES.find(preset => preset.value === 'dark-navy');
    expect(ko('M2').querySelector('[data-phylogeny-zero-outline]')).toHaveAttribute('stroke', expected.zeroStroke);
    expect(ref.current.querySelector('[data-phylogeny-legend-state="zero"] [data-phylogeny-zero-outline]'))
      .toHaveAttribute('stroke', expected.zeroStroke);
    expect(ko('M1').querySelector('rect')).toHaveAttribute('fill', expected.hit);
    expect(ref.current.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    fireEvent.keyDown(leaf('M1'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(leaf('M2'));
    fireEvent.keyDown(leaf('M2'), { key: 'ArrowDown' });
    expect(document.activeElement).toHaveAttribute('data-track-index', '0');
    fireEvent.keyDown(leaf('M2'), { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith({ magId: 'M2', role: 'leaf' });
  });
});
