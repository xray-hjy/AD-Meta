# GMrepo 多候选对照来源登记恢复

## 现象与根因

2026-10-20，本机 `/reference/gmrepo/comparison` 显示“数据读取失败”，实际 `comparison-catalog` 接口返回 HTTP 422：`Primary cohort source context is unavailable or changed.`。

旧 `gmrepo_primary_context.json` 要求 13 份来源文件逐项通过字节数与 SHA-256 校验。其中两份论文补充文件完整；另外 11 份指向 `ADMetaData/reference/gmrepo/closeout/2026-10-17-v3`，本机没有这一归档目录。原 GMrepo 核心运行 ZIP 不包含这批后续来源归档，拉取代码不会恢复它们。

当前原始物种矩阵与样本映射实际可用。恢复操作没有将旧归档标为存在，也没有删除来源校验；改为明确建立一个只覆盖本地已核验分析输入的新来源登记。

## 新登记的依据与边界

- 在既有 provenance 目录找到原样本映射副本，SHA-256 与旧登记完全一致：`991cab48cbbbce07d297a0c9720e41ae86e6744900f29e9af9d0e346f3585979`。
- 已发布物种修订仍为 `098416ecb5f143bba49867f26dd470c5`，原始 MetaPhlAn 表 SHA-256 为 `3d6bb636ccdd5306a851e9d9b795208057e7265eb9bd15109d9d761dd84cecfb`。
- 重读原始物种表，依照已有适配器将百分数除以 100，与 MySQL 已发布矩阵比较全部 **185 × 1,828 = 338,180** 个值，容差 `rtol=1e-12, atol=1e-14`；同时逐行核对 Run ID 和 AD/NC 分组。
- MySQL 物种表按现有契约只存非零观察。本次核对 36,523 条已存观察，并确认省略的 301,657 个格子在原始表中确实为零；缺失的原始非零值会拒绝恢复。
- 原 185 个 Run 保持 AD 122 / NC 63。公开逐人 ID 覆盖为 0，不把 Run 数写成已逐人核实的人数，也不确认跨队列独立性。

新登记 `evidenceScope=verified_local_analysis_inputs` 包含固定样本映射、导入清单快照、逐值核验回执、原始物种矩阵、样本分组表及两份已校验补充材料。它不继承旧归档中关于原研究人数、完整来源审查或工具运行的认证。

本地快照目录：`backend/storage/provenance/gmrepo-primary-context/2026-10-20-local-v1`。其中 `previous-context.json` 原样保存旧登记，`historical-source-checks.json` 保留旧 13 项来源及本次的 11 项缺失 / 2 项校验通过情况。旧固定评估和属级缓存保持原字节，新评估使用新来源与代码指纹。

完整旧研究来源登记仍有缺失依赖；此次修复不等于恢复全量历史证据支持包、WGS 扩展来源或科研批准。页面、报告及复算包继续标注研究用途、身份和跨平台比较限制。

## 可复核的恢复命令

新增 `app.cli.rebind_gmrepo_primary_context`。默认只读，显式 `--apply` 才写新快照和当前来源登记。输出目录必须全新且位于本项目内，数据库与原始文件均不写入。

```bash
cd backend
.venv/bin/python -m app.cli.rebind_gmrepo_primary_context \
  --output storage/provenance/gmrepo-primary-context/NEW-SNAPSHOT

# 核验成功后，以相同参数加 --apply 保存新登记。
```

该工具要求原始 MetaPhlAn 输入、固定样本映射及已发布数据库均可核验；它不是缺失数据的下载器。映射字节变化、分组冲突、物种集合不完整、原始非零观察缺失、丰度变化、未知单位、源哈希不符均拒绝发布。新来源登记固定到准确的物种修订及源 SHA-256，不能用于另一个修订。

换机时，需要携带本地快照及其中登记的原始依赖，或在目标机已有正确数据和发布数据库的前提下重新只读核验并建立新的本地登记。不能仅复制当前 JSON 后声称历史归档已经恢复；后续公开分发原研究附件也不由本次本地恢复授权。

## 验证结果

- 后端全量：**334 passed，1 skipped，14 subtests passed**。新增 11 个恢复回归用例，覆盖只读核验、旧登记保留、协变量篡改、原始零值与缺失非零值的区分、数据库数值/分组/特征/哈希/单位变化及修订隔离。
- 新增工具与测试通过 Ruff；新增工具独立 mypy 通过。对相关既有服务执行 mypy 仍有 `gmrepo_primary_genus.py` 原有设计信息字典的 5 个类型推断问题，本次未据此声称全项目类型检查通过。
- 实际接口 HTTP 200：主队列完整 966 属，外部各 322 属，目录 1,113 项；175 唯一对应、785 仅主队列、6 歧义、147 仅外部参考。
- 新算出的完整 966 属统计与原缓存逐项比对：未调整 p/q/秩效应，以及调整后效应、p/q、区间上下界全部吻合，比较容差 `rtol=1e-10, atol=1e-12`。
- 实际浏览器通过目录加载、Bacteroides 检索与选择、固定候选及报告 / JSON / 复算 ZIP 下载；390px 页面通过加载和选择。没有页面运行异常或 HTTP 失败。
- 浏览器下载的 ZIP 在独立目录用 `python -I replay.py` 复算：主队列全部 966 属、两个合格外部队列各 322 属通过；三个描述性队列仍不检验。没有重跑 FASTQ、正式 R 模型或原论文。
- 新固定评估：`7e1e4f2374eeef909125a82bd65b1e29d475bfa4594803ee4a1bc54fa32949f7`；新属级派生指纹：`92e1d5fc6531114c99010d4859bbdf19ff3a82014cac1cac9bf7e8857a91756d`。
- 修复前登记的 1,187 份参考、旧属级缓存与评估文件逐项核对，字节数、SHA-256、权限均保持不变。
- 上一轮备份登记的 3,456 份本地修改及未跟踪文件逐项复核，内容与权限同样保持不变。

本机备份及核验回执位于 `.tmp/gmrepo-comparison-repair/20261020-233434`，浏览器截图及实际下载位于 `/private/tmp/ad-meta-comparison-qa`。正常前后端已用 `npm run dev` 重启，监听本机 3000 / 8000。

## 2026-10-21 补充脚本原件

用户补充 `scripts(1).zip` 后，确认其中 MetaPhlAn 主脚本/配置及 DiTing 主脚本/配置共四份的字节数和 SHA-256 与旧登记完全一致，已原样补回对应历史路径。旧登记路径的缺失项由 11 项降至 7 项；本节补充不改写前述恢复时的历史核验回执。

包中三个输入名单的 185 个 CRR 与当前主矩阵完全相同，DiTing 通路表也与当前原始通路文件逐字节一致。但两份 DiTing 日志分别以缺少 reads 和 `IndexError` 结束，不认定为成功生成当前产物的运行。当前来源上下文和矩阵保持既有修订，真实对照与资源接口均返回 200，资源接口确认四份来源为 `verified`。

原包、64 文件副本及核验说明位于 `backend/storage/provenance/bioinformatics/2026-10-21-scripts-6710509997ba/`，详见其中 `README.md`、`receipt.json` 与 `sample-input-scope.json`。
