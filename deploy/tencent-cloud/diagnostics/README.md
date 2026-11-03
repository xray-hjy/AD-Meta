# AD-Meta 整机失联：受限单包诊断工具

本工具用于下一轮定位，不替代网站部署包。只针对 beachmat 2.24.0 及其递归依赖做一次受限恢复/编译，
使用独立诊断项目与 R 库；不重新安装 R，不恢复全部 295 个包，不重导入数据库，不替换现有应用 R 库。
既有下载与已完成的 renv 缓存会复用，beachmat 本身明确强制重编，以免把缓存命中当成编译成功。

## 先准备，不启动

将本小包解压到服务器私有目录 `/root/admeta-diag-kit-20261026/`；同名目录已存在时先检查，不覆盖混用。

```bash
python3 /root/admeta-diag-kit-20261026/diagnose.py prepare
```

这一步新增独立诊断目录与配置草稿，读取当前状态，但不启动服务或编译。它会检查：

- 当前是否还有其他 R/编译器进程；有则停止准备，不终止它们。
- 至少 2048MiB 可用内存、2048MiB 空闲 swap、2GiB 根盘可用空间。
- `vm.panic_on_oom` 必须为 0；非零或无法读取时拒绝测试，不擅自修改。
- cgroup v2 的 CPU/内存控制器、应用用户、R 4.5.2、全局可用的 renv 和原项目锁文件。

预检失败只返回原因，不安装缺失软件、不更改配置。
预检成功后返回 `PREPARED_RUN=/root/admeta-diagnostics/<唯一编号>`。
请先把预检输出发回当前排查对话，暂不执行 start。

## 下一轮：有明确资源边界的单次复现

预检核对后，使用 prepare 返回的精确目录，按本机排查对话的下一步指令启动：

```bash
python3 /root/admeta-diag-kit-20261026/diagnose.py start /root/admeta-diagnostics/替换为本次唯一编号
```

start 会重新执行预检，再创建两个唯一命名的临时 systemd 单元。
先启动独立记录器并等它就绪，再异步启动单包测试；不通过 DSH 长时间阻塞等待或持续输出编译日志。
单元只写 `/run/systemd/system/`，没有 enable、没有自动重启、没有开机自动重试。

测试资源约束：

| 项目 | 限制 |
| --- | --- |
| CPU | 最多相当于 1 个逻辑 CPU；调度优先级降低 |
| 内存软阈值 | 1536MiB |
| 内存硬上限 | 2048MiB（包括该 cgroup 计入的缓存等，非单纯 R RSS） |
| swap 上限 | 1024MiB |
| 最长运行 | 20 分钟；停止宽限期 20 秒 |
| 失败处理 | 不重试，不提高资源上限，不启用原编译服务 |

记录器每约 2 秒保存：主机内存与换页计数、CPU/磁盘累计计数、CPU/内存/I/O 压力、
占用较高和测试相关的进程、测试 cgroup 内存与事件、服务状态；另保存新的内核日志。
每次写入尝试 fsync，降低手动重启导致尾部数据未落盘的风险；不能保证在整机/磁盘硬故障时一定保存成功。

如果主机可用内存连续两次低于 256MiB，记录器只请求停止本次唯一测试单元，不操作其他服务。
这些限制旨在降低再次失联的风险，不能保证消除内核或宿主侧故障。
尤其要注意：**测试达到人为设定的 cgroup 上限而 OOM，只能证明触及本次限制，不能直接证明历史整机故障就是 OOM。**

## 取回结果

启动后先返回 run_dir 与两个 unit 名称，避免让 AI 把大量日志反复灌入聊天。
结束或中止后执行：

```bash
python3 /root/admeta-diag-kit-20261026/diagnose.py report /root/admeta-diagnostics/替换为本次唯一编号
```

report 返回资源摘要、服务退出状态，以及少量日志尾部；不会重新启动任务。
原始数据在该 run_dir 中：`samples.jsonl`、`build.log`、`kernel-follow.log`、`summary.json`、服务草稿及预检结果。
R 库放在 `/var/lib/admeta/diagnostics/<唯一编号>/project/library`，原应用库与原有 00LOCK 不作清理。
本工具也不覆盖 `/root/admeta-r-stage4.sh`、原编译服务或原编译日志。

判读时区分：正常完成、编译报错、超时、主动保护停止、测试 cgroup OOM、整机再次失联。
如果整个主机再次失联，优先保留腾讯云控制台/VNC 信息；恢复后读取本次独立记录，不把系统空闲误当成此前无压力。

## 本机验证边界

已在 Mac 检查 Python 语法、进程计数解析和 R 代码语法；未在目标 Linux 执行本工具，也未启动目标编译。
参考：[systemd 资源限制](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)、
[renv 选择包与独立库](https://rstudio.github.io/renv/reference/restore.html)、
[内核 panic_on_oom](https://docs.kernel.org/admin-guide/sysctl/vm.html#panic-on-oom)。
