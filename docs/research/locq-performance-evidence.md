# locq 性能优化写作证据

核查日期：2026-10-26。本文是博客写作底稿，不是重新执行的性能测试。

一手资料来自本机 `/Users/howardliu/WorkSpace/personal/locq` 的源码、Git 记录和保留的测量产物。已核实 `origin` 为 `https://github.com/longafterx/locq.git`，核查时 HEAD 为 `dd5676052567c05847a4471604fc4cbec6bfdda9`，工作区干净。以下 GitHub 链接对应本机对象；本次未联网确认每个对象的远端可达性。

## 可以成立的主线

locq 从 hhatto/gocloc 演进而来，主要优化是文件级有界并发、减少重复读取、复用逐行读取缓冲、减少逐行字符串分配、统一流水线。2026-10-22 在同一台 Apple M3 上对 Go 源码仓库的热缓存默认 CLI 测量中，locq 平均 0.249 秒，tokei 平均 0.247 秒。可以写“在这次实测中接近 tokei”，不能据此写“所有场景全面持平/领先”，也不能归因为 Go 与 Rust 的语言性能对决。

公开的结果摘要见 [2026-10-22 README](https://github.com/longafterx/locq/blob/858f0bd632ed47b91932205a55872aa3bed59e07/README.zh-CN.md)。

## 优化前的实际结构

上游基点 `679b457` 的 `Processor.Analyze` 先执行 `getAllFiles`，收集语言与文件，再按语言/文件双重循环同步调用 `AnalyzeFile`。`getAllFiles` 内执行语言识别和默认去重；去重用 `os.ReadFile` 读取完整文件，然后 `md5.Sum` 和十六进制格式化；保留的文件随后再次打开做行统计。语言识别还可能为 shebang 读取首行，或为有歧义的扩展名读取内容。因此可写“同一个文件可能在识别、去重、计数阶段重复打开和读取”，不宜写成“每个文件都完整读取三次”。

- [上游 Processor](https://github.com/hhatto/gocloc/blob/679b457182dcf852d90e52f132403d6b7de0e33d/gocloc.go)
- [上游发现与去重](https://github.com/hhatto/gocloc/blob/679b457182dcf852d90e52f132403d6b7de0e33d/utils.go)
- [上游语言识别](https://github.com/hhatto/gocloc/blob/679b457182dcf852d90e52f132403d6b7de0e33d/language.go)
- [上游逐行统计](https://github.com/hhatto/gocloc/blob/679b457182dcf852d90e52f132403d6b7de0e33d/file.go)

## 按提交核实的演进

| 时间与提交                                                                                                                                                                                                 | 已由代码证明的变化                                                                                                                | 数值证据边界                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 09-08 [ba0489f](https://github.com/longafterx/locq/commit/ba0489f5acd2cf324365fa1f9e0ed4f1f08d3e21)                                                                                                        | 新增 worker 配置；并行哈希、并行文件统计；由汇总端写共享 map；候选带发现序号，按序去重；以流式哈希替代整文件读入                  | 本提交没有可独立归因的前后耗时数据，不写“并发单项提速 N 倍”                                                                                                                               |
| 09-08 [e26bec3](https://github.com/longafterx/locq/commit/e26bec3a2076f814fbe8e403852e53451d9395de)                                                                                                        | `hashingReader` 在读取时同步更新 MD5，去重路径将哈希与行统计合并；新增真实目录 benchmark                                          | 可以解释减少物理读取次数；没有单项收益数字                                                                                                                                                |
| 09-17 [0660fd9](https://github.com/longafterx/locq/commit/0660fd999ee29413465bf9cb201bb03c3287c83e)                                                                                                        | 语言识别移入 worker，识别前缀重放给解析器；`WalkDir` 与安全目录剪枝                                                               | commit body 记录：Go 源码目录、8 workers、10 次热缓存 CLI 平均 `0.464s → 0.260s`。这是多个变化的组合收益，不能独归因于 `WalkDir`                                                          |
| 09-17 [fb67a24](https://github.com/longafterx/locq/commit/fb67a24b8377a5c1816c9843e18fec469656b09d)                                                                                                        | 非去重模式复用并发识别和统计流水线，仅跳过 MD5 与重复过滤                                                                         | commit body 记录关闭去重 benchmark 三组均值约 220 ms；与上一项的模式、测量口径不同，不直接拼接成严格提速曲线                                                                              |
| 09-19 [e42d2c8](https://github.com/longafterx/locq/commit/e42d2c81890a81ca546a229d85816d20300ffac2)                                                                                                        | 引入版本化合成语料、基准脚本、跨平台发布验证                                                                                      | 基准基础设施变化，不声称带来运行时提速                                                                                                                                                    |
| 09-19 [5e7aaec](https://github.com/longafterx/locq/commit/5e7aaeca69c2bc27e962a2c806363ebada37ad1d)                                                                                                        | 字节行替代逐行 `ReadString`；短行借用缓冲、长行复用 scratch；每个 worker 持有 reader；按需为回调/调试构造字符串；复用 `codeFlags` | commit body 记录：Apple M3、Go 仓库、8 workers、默认去重、6 组样本，中位耗时 `228.6 → 200.6 ms`（减少 12.24%），分配字节 `281.30 → 20.15 MiB/op`（减少 92.84%）；关闭去重时耗时差异不显著 |
| 09-20 [c7faab3](https://github.com/longafterx/locq/commit/c7faab31c8bc8aef4582068868141cf9134e7263)                                                                                                        | 默认改成每个文件分别计数；显式 `--dedup` 才按内容去重                                                                             | 这是语义与默认配置变化。不能把其前后的默认 CLI 差异全部归为实现优化                                                                                                                       |
| 09-21 [0d2a273](https://github.com/longafterx/locq/commit/0d2a27337e9fdfdc6e90b03c5569019c7cf9231d)                                                                                                        | 普通分析即使单 worker 也走统一流水线；当时回调/调试仍有保留语义的兼容路径                                                         | 没有独立单项耗时收益，不写具体倍数；该 observer 兼容路径后来被改动                                                                                                                        |
| 09-23 [087e026](https://github.com/longafterx/locq/commit/087e0265d13588e6ae4e6a5ec7ffecc79bb384e1)                                                                                                        | 历史阶段统一去重和并发回调，缓存去重事件、限制内存并清理临时文件                                                                  | 属于历史 API；多 worker 回调改成可并发，不能描述成现行目录 API                                                                                                                            |
| 09-28 [276e80a](https://github.com/longafterx/locq/commit/276e80a620ccf8fca773cc1c691f8a9add783e69) 与 09-30 [924d56d](https://github.com/longafterx/locq/commit/924d56d12506b0dd2afb17bf08854f31e15115a6) | 统一并扩展词法规则，修正字符串内注释符号等误判                                                                                    | 正确性及覆盖范围变化，不宜与早期性能数据做直接等价对比                                                                                                                                    |
| 10-22 [49f3bf4](https://github.com/longafterx/locq/commit/49f3bf448156e8454d6593fe3a016e844d0b1058)                                                                                                        | 移除 `Processor`、`ClocOptions` 兼容层；目录 API 用 `Options`；单文件用 `FileOptions.OnLine`                                      | 写当前示例应使用新 API，勿复活旧参数                                                                                                                                                      |
| 10-22 [98ad5d9](https://github.com/longafterx/locq/commit/98ad5d9c0de9622a678ae6dd71e1912e4e134ddf)                                                                                                        | 项目与命令统一更名 locq；本轮 README 测量实际构建源码                                                                             | 这是 10-22 数值对应的版本，不能称为对 HEAD 的重新测试                                                                                                                                     |
| 10-23 [49a6b05](https://github.com/longafterx/locq/commit/49a6b05cb3816a21b0bce681e78c38f5f1beeff1)                                                                                                        | 建立语义契约、语言矩阵、差分工具、固定 corpus、fuzz 与报告重放                                                                    | 晚于 10-22 性能报告。应写成后续补上的正确性保证，而非之前测量已经覆盖的完整体系                                                                                                           |

09-17 与 09-19 的单次优化数据来自历史提交正文；本次没有找到这些前后对照的入 Git 原始样本。可以明确转述“当时提交记录显示”，不应包装成此次重新实测或完整原始数据审计。

历史 [benchmarking.md](https://github.com/longafterx/locq/blob/5e7aaeca69c2bc27e962a2c806363ebada37ad1d/docs/benchmarking.md) 另记录 Go 1.26.6、darwin/arm64 下内存代码/注释微基准从 8,195 次分配降到 4 次。它是纯解析微基准，不是全目录扫描；文件后来在 `58c94a9` 停止跟踪，引用固定历史版本才可查。

## 现行实现中可以解释的细节

### 有界并发与稳定结果

[pipeline.go](https://github.com/longafterx/locq/blob/dd5676052567c05847a4471604fc4cbec6bfdda9/internal/core/pipeline.go) 为候选分配单调序号；worker 负责识别、读取、解析，汇总端按序处理。窗口大小为 `max(256, 32 * workers)`。发现端必须先获取 token，汇总完成才返还；因此乱序结果 map 的积压也受窗口约束，而不仅是 channel 的长度受约束。去重保留的是“发现顺序的第一个副本”，不受 worker 完成顺序影响。

该设计限制在途候选/结果和同时打开文件；最终结果表、目录遍历内部的目录项存储、已见摘要集合仍随输入增长。不要声称“整个程序内存严格为常数”或“所有内存都由 worker 数限制”。

### 少读一遍与少分配

[file.go](https://github.com/longafterx/locq/blob/dd5676052567c05847a4471604fc4cbec6bfdda9/internal/core/file.go) 中，`detectAndAnalyzeFile` 打开文件后按需套上 `hashingReader`，识别读取的前缀通过 `reader.prefix` 给解析器重放；重放不再更新 MD5，避免把同一段输入重复计算摘要。识别有歧义扩展名时仍可能 `io.ReadAll`，所以不可写“从不整文件读取”。

[reader.go](https://github.com/longafterx/locq/blob/dd5676052567c05847a4471604fc4cbec6bfdda9/internal/core/reader.go) 中，普通行使用 `bufio.Reader.ReadSlice`，遇到 `ErrBufferFull` 才将片段拼进可复用 `longLine`；返回的 `[]byte` 只在下一次读取前有效。worker 跨文件复用 reader；`release` 清除文件引用和 prefix，长行缓冲容量超过 64 KiB 则释放，避免罕见超长行长期占用内存。

可写“热路径不再为每行构造独立字符串”，不要写“全链路零分配”。`B/op` 是累计分配字节数，不是峰值 RSS；分配下降也不能直接推导 GC 暂停下降 92.84%。没有足够依据给出 GC 或 pprof 热点百分比。

### 当前回调语义

[options.go](https://github.com/longafterx/locq/blob/dd5676052567c05847a4471604fc4cbec6bfdda9/internal/core/options.go) 注释明确：目录分析不安装 observer；`FileOptions.OnLine` 用于同步单文件分析，在调用者 goroutine 中按物理行顺序运行，事件文本有独立所有权。9 月并发回调、回调事件临时文件属于后续被移除的 API 阶段，文章如非专门复盘，可略去。

## 2026-10-22 CLI 数据核查

源码 `98ad5d9c0de9622a678ae6dd71e1912e4e134ddf`；目标为 [golang/go 6b3800e](https://github.com/golang/go/tree/6b3800e1dd90925b4184acd6391f68bffd16b6a5)。环境：Apple M3、8 逻辑核、16 GiB、macOS 27.0.1、Go 1.27.3、darwin/arm64；tokei 15.0.0、cloc 2.04；上游源码 `679b457182dcf852d90e52f132403d6b7de0e33d`。

| 工具        | 样本数 |   平均秒 | 中位秒 |   最小～最大秒 |
| ----------- | -----: | -------: | -----: | -------------: |
| locq        |     30 | 0.249033 | 0.2255 |   0.197～0.402 |
| tokei       |     10 |   0.2474 |  0.239 |   0.198～0.341 |
| 上游 gocloc |     10 |   1.4567 |  1.426 |   1.242～1.838 |
| cloc        |      3 |   27.794 |  27.93 | 27.422～28.030 |

四个工具均使用各自默认 CLI 设置，没有额外调整线程或 runtime 环境。每个工具先非计时预热一次，快速工具交替顺序测量，cloc 随后测；stdout 重定向 `/dev/null`，全部样本保留。测量期间存在桌面后台任务。

上表来自本机 `benchmark-results/readme-locq-20261022-173633/{environment.txt,report.md,raw.txt,summary.json}`，公开摘要见 [README](https://github.com/longafterx/locq/blob/858f0bd632ed47b91932205a55872aa3bed59e07/README.zh-CN.md)。`benchmark-results/` 整体被忽略，`git ls-files benchmark-results` 没有任何输出；不能构造这些产物在 locq GitHub 上的 blob 链接。博客如需对外提供原始数据，应另行归档。

本文配套归档已保存到 `public/posts/locq-performance/cli-benchmark-2026-10-22.json`，包含文中使用的全部 50 条 locq/tokei/gocloc 样本、环境、源码版本、测量方法、统计摘要和原始 `raw.txt` 的 SHA-256。归档时从原始样本重新计算并核对了样本数、平均值和中位数；未重新运行性能测试，也未纳入正文未使用的 cloc 样本。

本轮 locq、tokei 代表输出的文件数分别为 14,292 与 14,319。语言识别、忽略规则、重复文件及嵌入语言等口径并未严格统一。因此可报告默认使用体验，也可说上游到 locq 的默认耗时相差约 5.85 倍，但不能把这个倍数全部归于纯解析器，或宣称同语义工作量下的严格加速比。cloc 预热有 2 个文件超时，三次计时分别有 2、3、3 个超时，不能把它描述为相同工作量的完整执行。

## 固定语料基准与正确性边界

[scripts/BENCHMARKS.md](https://github.com/longafterx/locq/blob/dd5676052567c05847a4471604fc4cbec6bfdda9/scripts/BENCHMARKS.md) 与 [benchmark.sh](https://github.com/longafterx/locq/blob/dd5676052567c05847a4471604fc4cbec6bfdda9/scripts/benchmark.sh) 描述独立的合成语料矩阵：大量小文件、少量大文件、重复内容、大量注释、超长行和多语言。脚本先验证计数与语料指纹，再执行耗时/吞吐/分配测试，记录 runtime 配置、原始样本和 benchstat 汇总。10-22 运行的全部 92 组，每组 6 次，`-benchtime=200ms`，`GOMAXPROCS=8`、`GOGC=100`、`GOMEMLIMIT=off`。

这组是库级热缓存基准，包含初始化、遍历、检测、读取、可选去重和计数；不包含 CLI 启动与输出格式化。`MB/s` 使用包括重复副本在内的输入字节，并非磁盘带宽。名称中的 `workers=8` 与 Go benchmark 尾缀 `-8`（GOMAXPROCS）是不同维度。四个大文件无法同时占用八个文件 worker。

随后引入的 [counting-semantics.md](https://github.com/longafterx/locq/blob/49a6b05cb3816a21b0bce681e78c38f5f1beeff1/docs/counting-semantics.md) 和 [correctness.md](https://github.com/longafterx/locq/blob/49a6b05cb3816a21b0bce681e78c38f5f1beeff1/docs/correctness.md) 强调独立逐行期望、读取分片一致性、1/8 workers 一致性和按发现顺序去重。差分工具按文件集合、语言映射、词法计数等类别排查差异；不把其他工具总数作为正确性 oracle。

Plain Text 非空行在 locq 计为 Code，而 tokei 15 可计为 Comment，这是已记录的精确语义差异；不同总数不自动意味着错误，也不能把其他未知差异一概解释为这个原因。当前差分文档还说明完整 Go 仓库上的 cloc 对比存在超时/截止时间问题，不能说“所有工具在全部真实仓库完全对齐”。

## 不应写入正文的无证据叙述

- 没有核实的 pprof 火焰图、热点占比、GC 暂停时间、CPU cache miss 数据。
- “加了 goroutine 就快了 8 倍”“WalkDir 单项带来 44% 提升”等拆分归因。
- “零分配”“零拷贝”“磁盘吞吐达到 4.8 GB/s”“内存峰值下降 92.84%”。
- 将不同 Go 版本、目标仓库、默认去重设置、词法覆盖范围的历史数字画成连续严格对照。
- 把 10-23 的正确性体系回写成 10-22 已完成的验证，或声称它证明与 tokei 完全同语义。

本次仅做读取与写作核查，未修改 locq，也未重新执行性能测量。
