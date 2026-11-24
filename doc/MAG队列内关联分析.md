# PRJCA022804 队列内关联分析

第十四项的离线分析入口是 `backend/app/cli/mag_robustness.py`。运行时需要已导入的 MAG 数据发布、该发布的原始元数据和 CoverM 丰度表，以及 `backend/requirements.txt` 中的 Python 依赖。以下命令从项目根目录运行。

```bash
cd backend
admeta_mag_revision=254e42605c83ac844542123a39c0ba06181803fb5cdb9baca6150e48f686cddc
admeta_mag_output="$(mktemp -d)/PRJCA022804-MAG"
.venv/bin/python -m app.cli.mag_robustness fit \
  --dataset prjca022804-ad-nc \
  --revision "$admeta_mag_revision" \
  --protocol metadata/mag_robustness_prjca022804.json \
  --output "$admeta_mag_output"
```

| 文件 | 内容 |
| --- | --- |
| `associations.csv` | 每个代表 MAG 一行，含未校正和已校正模型、样本数、状态与影响诊断。 |
| `leave-one-batch-out.csv` | 每个 MAG 与剔除批次一行，含剩余样本数、估计、区间、拟合状态和相对完整队列的变化。 |
| `methods-and-qc.json` | 输入指纹和模型版本、样本纳入规则、设计诊断、影响样本检查、两张结果表的 SHA-256。 |

两张表通过 `release`、`analysisVersion` 和 `magId` 关联。当前分析使用核对过 SHA-256 的原始 CoverM 相对丰度百分比。脚本核验样本与 MAG 索引及数据库读回精度后，在原始正值上取 log₂。两个主模型使用相同样本，NC 为参照，分别计算 HC3 置信区间及 BH-FDR。逐批剔除报告效应和区间。当前记录的观测单位是唯一粪便样本，样本独立性假设及年龄重叠范围见方法记录。

将结果接入本地页面时，执行下列命令。安装会复核修订、代表 MAG、样本和结果表的完整性，并一次写入当前后端的 `storage/derived/mag-robustness`。

```bash
.venv/bin/python -m app.cli.mag_robustness install \
  --dataset prjca022804-ad-nc \
  --revision "$admeta_mag_revision" \
  --input "$admeta_mag_output"
```

应用只为精确匹配的发布修订提供下载和完整队列结果。当前范围的 Mann–Whitney U 检验继续使用页面的样本筛选。后续发布需要各自的分析协议和完整数据指纹。`processingBatch` 绑定已核实的来源文件、SHA-256、列名及技术含义，脚本按样本 ID 读取该列。字段缺失、语义未确认、单批次或设计不可估计时，方法记录说明批次校正与逐批剔除状态。此处的模型用于队列内探索性关联。独立队列复现保留在内部研究计划，启动条件包括独立样本和可比的 MAG 定量数据。
