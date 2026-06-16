# AD-Meta Public API

This document is the frontend/backend contract. The frontend must render from
these response shapes only. The backend must keep real responses compatible
with these examples.

## Base Rules

- Public visitors can only call read-only `GET` endpoints.
- No login, registration, upload, raw file download, or database query endpoint
  is exposed.
- API responses must not include server filesystem paths.
- Only datasets with `status = "published"` are visible.

## Error Shape

```json
{
  "detail": "Dataset not found"
}
```

Use standard HTTP status codes:

- `404`: dataset or chart artifact not found.
- `400`: unsupported chart type.
- `500`: cache exists in the database but cannot be read.

## GET /api/datasets

Returns all published datasets.

```json
[
  {
    "id": 1,
    "slug": "ad-nc-species",
    "name": "AD vs NC Species Abundance",
    "description": "Species abundance comparison between AD and NC groups.",
    "sampleCount": 373,
    "speciesCount": 9821,
    "featureCount": 9821,
    "featureKind": "taxonomy",
    "featureLabel": "物种",
    "groupCounts": {
      "AD": 182,
      "NC": 191
    },
    "publishedAt": "2026-06-01T10:00:00Z"
  }
]
```

## GET /api/datasets/{slug}

Returns one published dataset.

```json
{
  "id": 1,
  "slug": "ad-nc-species",
  "name": "AD vs NC Species Abundance",
  "description": "Species abundance comparison between AD and NC groups.",
  "sampleCount": 373,
  "speciesCount": 9821,
  "featureCount": 9821,
  "featureKind": "taxonomy",
  "featureLabel": "物种",
  "groupCounts": {
    "AD": 182,
    "NC": 191
  },
  "publishedAt": "2026-06-01T10:00:00Z",
  "availableCharts": [
    "species",
    "phylum",
    "boxplot",
    "heatmap",
    "sunburst",
    "pca",
    "pcoa"
  ]
}
```

## GET /api/datasets/{slug}/summary

Returns summary-card data.

```json
{
  "datasetSlug": "ad-nc-species",
  "datasetName": "AD vs NC Species Abundance",
  "totalSamples": 373,
  "adSamples": 182,
  "ncSamples": 191,
  "featureKind": "taxonomy",
  "featureLabel": "物种",
  "totalFeatures": 9821,
  "totalSpecies": 9821,
  "groupCounts": {
    "AD": 182,
    "NC": 191
  },
  "publishedAt": "2026-06-01T10:00:00Z"
}
```

## GET /api/datasets/{slug}/charts/species

Returns ranked species abundance comparison data. The backend caches Top 50;
the frontend may display fewer.

```json
[
  {
    "species": "Bacteroides_fragilis",
    "fullName": "k__Bacteria|p__Bacteroidetes|c__Bacteroidia|g__Bacteroides|s__Bacteroides_fragilis",
    "adMean": 120.4,
    "adStd": 31.2,
    "ncMean": 80.1,
    "ncStd": 22.7,
    "total": 200.5
  }
]
```

## GET /api/datasets/{slug}/charts/phylum

Returns phylum-level group composition.

```json
[
  {
    "phylum": "Firmicutes",
    "adRatio": 0.42,
    "ncRatio": 0.37
  },
  {
    "phylum": "Other",
    "adRatio": 0.08,
    "ncRatio": 0.11
  }
]
```

## GET /api/datasets/{slug}/charts/boxplot

Returns precomputed boxplot values for Top 30 species.

```json
{
  "items": [
    {
      "fullName": "k__Bacteria|p__Bacteroidetes|g__Bacteroides|s__Bacteroides_fragilis",
      "shortName": "Bacteroides_fragilis",
      "total": 200.5,
      "adBox": [0.1, 3.2, 5.1, 8.9, 15.0],
      "ncBox": [0.0, 1.8, 3.3, 6.5, 12.1],
      "adOutliers": [20.2],
      "ncOutliers": [],
      "adOutlierPoints": [{ "sample": "AD1", "value": 20.2 }],
      "ncOutlierPoints": [],
      "adLogOutliers": [1.3263],
      "ncLogOutliers": [],
      "adLogOutlierPoints": [{ "sample": "AD1", "value": 1.3263 }],
      "ncLogOutlierPoints": []
    }
  ]
}
```

Box value order is `[lowerWhisker, q1, median, q3, upperWhisker]`.
The numeric `*Outliers` arrays are retained for compatibility. New
`*OutlierPoints` arrays pair each outlier value with the normalized sample
identifier used in tooltips.

## GET /api/datasets/{slug}/charts/heatmap

Returns the filtered differential heatmap matrices only. It must not return
the full abundance matrix.

```json
{
  "filter": {
    "pValueMax": 0.05,
    "log2FcMinAbs": 1,
    "topN": 30
  },
  "stats": [
    {
      "col": "k__Bacteria|p__Firmicutes|g__Example|s__Example_species",
      "fullName": "k__Bacteria|p__Firmicutes|g__Example|s__Example_species",
      "label": "species",
      "p": 0.004,
      "log2FC": 1.8,
      "meanAD": 10.1,
      "meanNC": 2.9,
      "diffLog": 0.48
    }
  ],
  "colLabels": ["species"],
  "adMatrix": [[1.2, 1.5]],
  "ncMatrix": [[0.2, 0.4]],
  "adLabels": ["S001"],
  "ncLabels": ["S002"],
  "diffMatrix": [[0.48]],
  "diffLabels": ["AD - NC"],
  "colOrder": [0],
  "combinedRowOrder": [0, 1],
  "dendrograms": {
    "metric": "euclidean",
    "linkage": "average",
    "rows": {
      "merges": [[0, 1, 1.25, 2]]
    },
    "columns": {
      "merges": []
    }
  },
  "maxV": 3.2,
  "maxAbs": 0.8,
  "pairedRows": 191
}
```

`combinedRowOrder` indexes the rows of `adMatrix` followed by `ncMatrix`.
The row dendrogram leaf ids use that same combined row index. Column
dendrogram leaf ids index the un-reordered `stats` and `colLabels` arrays;
`colOrder` supplies their displayed leaf order. Each merge has SciPy linkage
shape `[leftNodeId, rightNodeId, distance, leafCount]`. Empty merges are valid
for a single leaf or a degenerate matrix with no finite clustering distance.

## GET /api/datasets/{slug}/charts/lda

Returns KO-only LDA marker data. The backend first keeps significant KO
features with `p < pValueMax`, then displays up to `perGroupTopN` AD-enriched
and up to `perGroupTopN` NC-enriched KO features. It does not add
non-significant KO features to force equal group counts.

```json
{
  "featureLabel": "KO",
  "method": "Mann-Whitney U + univariate LDA on log10(abundance + 1)",
  "filter": {
    "pValueMax": 0.05,
    "topN": 30,
    "selectionMode": "balanced_significant_by_group",
    "perGroupTopN": 15
  },
  "summary": {
    "significantCount": 230,
    "adEnrichedCount": 7,
    "ncEnrichedCount": 223,
    "displayedCount": 22,
    "adDisplayedCount": 7,
    "ncDisplayedCount": 15
  },
  "items": [
    {
      "koId": "K17398",
      "koName": "K17398",
      "enrichedGroup": "AD",
      "ldaScore": 0.523,
      "pValue": 0.0063,
      "log2FC": 1.321,
      "meanAD": 151.43,
      "meanNC": 60.62
    },
    {
      "koId": "K03686",
      "koName": "K03686",
      "enrichedGroup": "NC",
      "ldaScore": 4.151,
      "pValue": 0.0081,
      "log2FC": -0.142,
      "meanAD": 3468.28,
      "meanNC": 3826.6
    }
  ]
}
```

## GET /api/datasets/{slug}/charts/sunburst

Returns an ECharts-compatible taxonomy tree.

```json
[
  {
    "name": "Firmicutes",
    "value": 1000,
    "children": [
      {
        "name": "Bacilli",
        "value": 600,
        "children": [
          {
            "name": "Lactobacillus",
            "value": 300,
            "children": [
              {
                "name": "Lactobacillus_acidophilus",
                "value": 120
              }
            ]
          }
        ]
      }
    ]
  }
]
```

## GET /api/datasets/{slug}/charts/pca

Returns precomputed PCA coordinates.

```json
{
  "method": "PCA",
  "speciesCount": 50,
  "variance": [0.42, 0.18],
  "points": [
    {
      "sample": "S001",
      "group": "AD",
      "x": 1.23,
      "y": -0.45
    }
  ],
  "ellipses": [
    {
      "group": "AD",
      "points": [[1.2, -0.4], [1.3, -0.3]]
    }
  ]
}
```

## GET /api/datasets/{slug}/charts/pcoa

Returns precomputed PCoA coordinates and PERMANOVA.

```json
{
  "method": "PCoA",
  "distance": "Bray-Curtis",
  "speciesCount": 500,
  "variance": [0.31, 0.16],
  "points": [
    {
      "sample": "S001",
      "group": "AD",
      "x": 0.12,
      "y": -0.08
    }
  ],
  "ellipses": [
    {
      "group": "NC",
      "points": [[0.2, 0.1], [0.22, 0.08]]
    }
  ],
  "permanova": {
    "r2": 0.12,
    "pValue": 0.001,
    "fStat": 5.3,
    "nPerm": 999
  }
}
```
