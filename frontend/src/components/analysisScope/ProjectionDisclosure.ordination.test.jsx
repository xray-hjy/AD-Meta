import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProjectionDisclosure from './ProjectionDisclosure';
import { PCA_FEATURE_SELECTION_METHOD } from '../../app/ordinationPolicy';

function baseData(kind) {
  return {
    featureLabel: '物种',
    scope: { mode: 'cohort', groups: [], sampleCodes: [] },
    dataSemantics: { normalization: 'known' },
    projection: {
      kind,
      sampleCount: 373,
      sourceFeatureCount: 9460,
      returnedFeatureCount: 50,
      samplePointCount: 373,
    },
  };
}

describe('ProjectionDisclosure ordination summaries', () => {
  it('keeps PCA variance metadata in the structured disclosure', () => {
    const data = baseData('pca');
    data.projection.featureSelection = { method: PCA_FEATURE_SELECTION_METHOD };
    data.payload = { variance: [0.151, 0.083] };

    render(<ProjectionDisclosure data={data} />);

    expect(screen.getByText('PC1 15.10%，PC2 8.30%，前两轴合计 23.40%')).toBeInTheDocument();
  });

  it('does not replace an explicit zero point count with the scope count', () => {
    const data = baseData('pca');
    data.projection.samplePointCount = 0;
    data.projection.featureSelection = { method: PCA_FEATURE_SELECTION_METHOD };
    data.payload = { variance: [] };

    render(<ProjectionDisclosure data={data} />);

    expect(screen.getByText('无样本进入当前投影')).toBeInTheDocument();
    expect(screen.queryByText('绘制 373 个样本点')).not.toBeInTheDocument();
  });

  it('keeps PCoA inference metadata in the structured disclosure', () => {
    const data = baseData('pcoa');
    data.projection.featureSelection = {
      preset: 'standard',
      minimumRelativeAbundance: 0.0001,
      minimumPrevalence: 0.1,
      retainedMass: { mean: 0.96 },
    };
    data.projection.inference = { permanovaStatus: 'computed_exploratory_unadjusted' };
    data.payload = {
      permanova: { r2: 0.0061, fStat: 2.2849, pValue: 0.002, nPerm: 999 },
      permdisp: { fStat: 1.2345, pValue: 0.25, nPerm: 999 },
      eigenDiagnostics: { negativeEigenvalueCount: 2 },
    };

    render(<ProjectionDisclosure data={data} />);

    expect(screen.getByText(/PERMANOVA R²=0.0061，F=2.2849，p=0.0020，置换 999 次/)).toBeInTheDocument();
    expect(screen.getByText(/PERMDISP（正\/负轴校正）F=1.2345，p=0.2500，有效置换 999 次/)).toBeInTheDocument();
    expect(screen.getByText('存在 2 个负特征值，坐标轴解释率按正特征值计算')).toBeInTheDocument();
  });

  it('marks a degenerate PERMDISP result as not interpretable', () => {
    const data = baseData('pcoa');
    data.projection.featureSelection = {
      preset: 'unfiltered',
      retainedMass: { mean: 1 },
    };
    data.projection.inference = {
      permanovaStatus: 'computed_exploratory_unadjusted',
      permdispStatus: 'not_interpretable_degenerate_dispersion',
    };
    data.payload = {
      permanova: { r2: 0.1, fStat: 1, pValue: 0.2, nPerm: 99 },
      permdisp: { interpretable: false, fStat: null, pValue: null, nPerm: 0 },
    };

    render(<ProjectionDisclosure data={data} />);

    expect(screen.getByText('负轴校正后的组内离散距离退化，PERMDISP 不具备可解释性')).toBeInTheDocument();
    expect(screen.queryByText(/PERMDISP（正\/负轴校正）F=/)).not.toBeInTheDocument();
  });
});
