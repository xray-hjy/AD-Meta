# AD/NC 物种结果源文件

当前源文件为 `taxonomy.tsv`，用户于 2026-10-16 提供。`#metaphlan4` 为文件内方法标记；现已取得项目 MetaPhlAn 4 脚本和配置，脚本指定 `mpa_vOct22_CHOCOPhlAnSGB_202403`、`rel_ab_w_read_stats` 及双端输入。这是脚本配置依据，不能据此推定实际安装小版本或该表对应的成功执行记录；来源论文方法不代替本项目方法。脚本原件与主队列来源已归档到 `ADMetaData/reference/gmrepo/closeout/2026-10-17-v3`。

- 185 个 CRR 样本，与既有样本集合完全一致：AD 122、NC 63。团队明确研究 AD/NC 二分类，纳入 PRJCA022804 中两组全部样本。
- `samples.tsv` 保留既有数据的编号与分组，并已与 `samples_current185.tsv` 逐条核对。导入按编号关联，不按列顺序分组。
- TSV 的 5,525 行含多个分类层级。导入只取末端 `s__` 的 1,828 行，排除上层分类和 `t__` 行，避免重复累加。
- 原值是百分数；各样本种级和为 99.99989–100.00011%。后端除以 100 存为 0–1 比例，不二次闭合、不补零、不把 SGB/GGB 换成猜测的命名物种。
- `raw.csv` 保留为历史源表，已不被当前 manifest 使用。旧分析应固定旧 revision。

执行 `python -m app.cli.bootstrap_storage --slug ad-nc-species` 仅发布新的物种版本并同步分析运行，保留 KO 当前版本。发布需要本地统计服务正常运行；大表替换可在该次命令中设置 `AD_META_MYSQL_READ_TIMEOUT=600`。每次发布前需给 manifest 指定新的分析运行 key，已发布运行不可改绑数据版本，不应反复导入同一源文件。新 revision 保存原始 TSV、实际分组表、转换矩阵以及转换报告和源文件校验值。
