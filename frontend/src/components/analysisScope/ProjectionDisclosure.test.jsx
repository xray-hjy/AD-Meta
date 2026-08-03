import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProjectionDisclosure from './ProjectionDisclosure';

function projectionData(kind, projection = {}) {
  return {
    featureLabel: '物种',
    scope: { mode: 'cohort', groups: [], sampleCodes: [] },
    dataSemantics: { abundanceScale: 'unknown', normalization: 'unknown' },
    projection: {
      kind,
      sampleCount: 12,
      sourceFeatureCount: 9820,
      returnedFeatureCount: 50,
      ...projection,
    },
  };
}

describe('ProjectionDisclosure', () => {
  it('separates heatmap eligibility from its display cap', () => {
    render(
      <ProjectionDisclosure
        data={projectionData('heatmap', {
          eligibleFeatureCount: 137,
          parameters: { qValueMax: 0.05, log2FcMinAbs: 1 },
        })}
      />,
    );

    expect(screen.getByText(/筛得 137 个满足/)).toBeInTheDocument();
    expect(screen.getByText(/展示排名前 50 个/)).toBeInTheDocument();
    expect(screen.getByText('上游标准化方式待确认')).toBeInTheDocument();
  });

  it('describes PCoA as exploratory when inference is not applicable', () => {
    render(
      <ProjectionDisclosure
        data={projectionData('pcoa', {
          samplePointCount: 12,
          featureSelection: {
            method: 'label_blind_relative_abundance_and_prevalence',
            preset: 'standard',
            selectedCount: 50,
            sourceFeatureCount: 9820,
            minimumRelativeAbundance: 0.0001,
            minimumPrevalence: 0.1,
            retainedMass: { mean: 0.975 },
          },
          inference: { permanovaStatus: 'not_applicable_single_group' },
        })}
      />,
    );

    expect(screen.getByText(/无标签过滤保留 50\/9820/)).toBeInTheDocument();
    expect(screen.getByText(/相对丰度 ≥ 0.01%，检出率 ≥ 10.00%/)).toBeInTheDocument();
    expect(screen.getByText(/平均保留质量 97.50%/)).toBeInTheDocument();
    expect(screen.getByText(/当前为单组排序探索/)).toBeInTheDocument();
  });
});
