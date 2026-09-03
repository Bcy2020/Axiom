# 简易 DAW 音乐宿主 PRD（Agent 测试试题）

## 1. 产品目标

开发一个具备真实音乐制作能力的桌面端简易 DAW（Digital Audio Workstation，数字音频工作站）。产品可参考 Cubase 一类传统 DAW 的工作流，但不要求复刻其视觉设计，也不限定任何技术栈、开发语言、UI 框架、音频引擎、插件框架或工程实现方式。本 PRD 只定义产品能力、交互逻辑、数据规则和验收标准。

该产品不能只是一个“长得像 DAW 的界面 Demo”，也不能只是 MIDI 编辑器或单轨播放器，而必须真正具备完成一首简单多轨音乐作品的能力。完整工作流至少应达到：新建工程 → 配置音频设备 → 创建多条乐器轨与音频轨 → 加载 VST 乐器与效果器 → 绘制和编辑 MIDI → 导入 WAV → 多轨同步播放 → 基础混音 → 保存工程 → 重新打开工程 → 导出最终 WAV。

## 2. 产品范围

产品至少需要支持：工程创建、工程设置、主时间轴、Instrument Track、Audio Track、多轨并发播放、VST Instrument、VST Effect、MIDI Part、Audio Part、钢琴卷帘、Velocity 编辑、Mute/Solo、Volume/Pan、Master、Transport、播放头、Loop、Snap、量化式网格吸附、Undo/Redo、Copy/Paste、工程保存恢复、WAV 导入、音频设备配置、最终音频导出。

产品应至少支持 32 条音轨。不同 Instrument Track 必须拥有独立的 VST 实例、MIDI 数据和混音状态，多条 Instrument Track 与 Audio Track 必须能够同时播放。

---

# 3. 主界面

主界面分为五个核心区域：顶部工具栏、左侧轨道控制区、上方音轨时间轴、下方编辑区、底部 Transport。上方音轨区用于编排 MIDI Part 和 Audio Part，下方编辑区主要用于显示钢琴卷帘；钢琴卷帘可以最大化并占据整个主编辑区域，再次点击恢复上下布局。

上下区域之间应存在可拖动分割线，用户可以调整音轨区和编辑区的高度。主界面必须清楚展示当前工具、当前选中对象、播放头位置、Snap 状态、当前 BPM、播放状态和工程修改状态。

---

# 4. 工程系统

新建工程时必须出现工程设置窗口，至少包含工程名称、保存位置、Sample Rate、Bit Depth 和 BPM。Sample Rate 至少支持 44100、48000、88200、96000 Hz；Bit Depth 至少支持 16 bit、24 bit、32 bit float；默认值建议为 44100 Hz、24 bit、120 BPM。

工程全局默认使用 4/4 拍。BPM 允许 20～300 BPM，修改 BPM 后 MIDI 在音乐时间轴上的小节与拍位置不得发生变化，但实际播放速度应改变。例如一个音符始终处于第 5 小节第 1 拍，120 BPM 改为 60 BPM 后其音乐位置仍然是第 5 小节第 1 拍，只是播放到该位置需要更长时间。

工程至少需要支持 Save、Save As、Open 和 Auto Save。默认自动保存间隔为 5 分钟，软件异常退出后再次打开时应提示是否恢复自动保存版本。

标题栏必须显示工程是否存在未保存修改，例如 `MyProject *`。保存后星号消失；退出存在未保存修改的工程时，必须提示“保存 / 不保存 / 取消”。

---

# 5. Transport 与播放头

底部 Transport 至少包含 Play、Pause、Stop、返回工程开始、Loop 开关、BPM、当前播放位置。Space 应作为 Play/Stop 快捷键。

音轨区域和钢琴卷帘均应显示同一个播放头。用户点击时间标尺任意位置可以定位播放头，播放过程中播放头向右移动。停止后重新 Play 时从当前播放头位置继续。第一次 Stop 停止播放，第二次 Stop 返回最近一次开始播放的位置。

Transport 是整个工程唯一的主时钟，所有 Instrument Track、Audio Track、VST、播放头、Loop 和最终导出都必须基于同一个工程时间模型运行，不允许不同轨道长期播放后逐渐产生漂移。

---

# 6. 时间轴与缩放

主音轨区横轴按小节显示，例如 `1、5、9、13、17、21`。编辑和显示的基础概念采用“小节 / 拍”，例如 `12.3` 表示第 12 小节第 3 拍。

音轨区必须支持水平滚动、水平缩放和垂直滚动。钢琴卷帘必须支持水平滚动、水平缩放、垂直滚动和纵向缩放。缩放行为只影响视觉显示，不得改变任何 Part 或 MIDI Note 的实际时间数据。

播放过程中当播放头离开可视区域时，钢琴卷帘应支持 Auto Follow 自动滚动，也允许用户关闭。

---

# 7. 音轨系统

工程至少支持两种轨道：Instrument Track 和 Audio Track。左侧轨道列表提供“添加音轨”，点击后允许选择 Instrument Track 或 Audio Track。

每条轨道至少具有 Track Name、Mute、Solo、Volume、Pan。Instrument Track 另外具有 Instrument Selector，Audio Track 允许载入 WAV。轨道默认名称可使用 `Instrument 01`、`Instrument 02`、`Audio 01`、`Audio 02`，并允许双击重命名。

轨道允许拖动改变视觉顺序，但不得改变其中 Part、MIDI、插件或混音状态。可以为轨道设置颜色，Part 默认继承轨道颜色。

Mute 后该轨道不得产生声音。Solo 支持多选：存在任意 Solo 轨时，只播放所有 Solo 状态的轨道；取消全部 Solo 后恢复正常多轨播放。

Volume 与 MIDI Velocity 必须是完全独立的概念。改变轨道 Volume 不得修改 MIDI Note Velocity。每条轨道还必须支持 Pan，范围至少为 L100～Center～R100。

---

# 8. Instrument Track 与 VST Instrument

创建 Instrument Track 时必须立即弹出 VST 乐器选择窗口，显示所有已识别的 Instrument Plugin，并提供“无”选项。选择 VST 后创建轨道并实例化插件；选择“无”仍然允许创建和编辑 MIDI，但该轨道没有声音，之后可以重新选择 VST。

每条 Instrument Track 必须拥有独立的 VST Instrument 实例。例如工程中可以同时存在 Drum VST、Bass VST、Piano VST、Synth VST 四个独立实例。切换当前选中轨道不得停止其他 VST 播放，也不得让不同轨道共享同一份 MIDI 数据。

点击 Instrument Track 中的乐器名称可以重新选择 VST。切换 VST 时现有 MIDI Part 和 MIDI Note 必须保持不变。

点击插件按钮应打开插件自身 UI，关闭 UI 不得卸载插件或清空参数。

---

# 9. VST 插件管理

软件应提供插件管理页面，允许用户指定一个或多个 VST 搜索目录并执行扫描。扫描结果至少区分 Instrument Plugin 和 Effect Plugin。

插件扫描过程中显示正在扫描状态，完成后显示成功插件和失败插件。单个损坏插件或加载失败插件不得导致软件崩溃，失败插件应被标记为加载失败。

打开工程时，如果原工程引用的 VST 已不存在，工程仍必须成功打开。对应轨道显示 `Missing Plugin: 插件名`，其 MIDI、Part、Velocity、Mute 等数据均保持可编辑。

---

# 10. 多轨真实播放要求

不同音轨必须能够同时播放，不允许采用“只播放当前选中轨”的假多轨方案。例如一个工程应可以同时存在并播放：Drums Instrument Track、Bass Instrument Track、Piano Instrument Track、Lead Instrument Track、Audio Track。

每条 Instrument Track 必须独立发送其 MIDI 数据到自己的 VST。单个 Instrument Track 必须支持 MIDI 复音，即同一时间可以存在多个不同或相同音高的音符并同时触发。例如 C4、E4、G4 在同一时刻应能形成和弦。

多条轨道的音频最终应汇总到 Master，并通过当前 Audio Device 实时播放。

---

# 11. Part 模型

Instrument Track 使用 MIDI Part，Audio Track 使用 Audio Part，统称 Part。Part 至少具有 Start、End、所属 Track 和内部内容。

允许同一轨道存在多个 Part，也允许 Part 时间范围相互重叠。两个重叠 MIDI Part 播放时，两者内部 MIDI 均应参与播放。

MIDI Part 内部保存 MIDI Notes；Audio Part 保存对 WAV 文件及其播放范围的引用。

---

# 12. 音轨区工具

音轨区至少提供 Select、Pen、Scissors、Glue 四种工具。当前工具必须具有清晰 Active 状态，且音轨区和钢琴卷帘可以拥有彼此独立的工具状态。

Select 用于单选、多选、框选、移动 Part 和调整 Part 长度。Shift + Click 可多选，点击空白区域取消选择。拖动 Part 改变 Start，内部 MIDI 内容同步移动。拖动左右边缘调整 Part 长度，但不得产生 `End <= Start`。

Pen 在空白轨道区域拖动可创建新 MIDI Part，例如从 5.1 拖到 9.1 创建 5.1～9.1 的空 Part。

Scissors 点击 Part 某个时间位置将其切成两部分。例如 1.1～9.1 在 5.1 切割后得到 1.1～5.1 与 5.1～9.1。如果存在跨越切割点的 MIDI Note，该 Note 也必须在对应时间点切成两条。

Glue 用于合并多个 Part。相邻 Part 可以直接合并；存在空隙时，合并后的 Part 范围覆盖最早 Start 到最晚 End，中间区域保留为空，不得自动生成 MIDI Note。

MIDI Part 和 Audio Part 至少支持 Ctrl+C、Ctrl+V、Ctrl+D 和 Delete。Ctrl+D 复制 Part 并紧接当前 Part 之后放置。

---

# 13. 音轨区 Snap

音轨区具有 Snap，但默认关闭。至少提供 1 Bar、2/4、1/2、1/4 四种精度。Snap 影响创建 Part、移动 Part、调整 Part 长度和剪切 Part。

当 Snap 开启时，按住 Alt 临时关闭；当 Snap 关闭时，按住 Alt 可以临时启用。松开 Alt 后恢复原状态。

---

# 14. 双击 Part 与钢琴卷帘

双击 Instrument Track 中任意 MIDI Part，应在主界面下方打开该 Part 的钢琴卷帘。空 MIDI Part 也必须能正常打开并创建 Note。

编辑器默认显示当前 Part 范围，Part 外区域可以显示为非活动区域。用户不应直接在当前 Part 外新建音符，但如果移动已有 Note 导致其超过 Part End，则允许自动扩展 Part 以容纳音符。

钢琴卷帘必须提供最大化按钮。最大化后其占据整个主编辑区域，上方音轨区暂时隐藏；恢复后重新显示上下布局，编辑数据不得变化。

---

# 15. 钢琴卷帘组成

钢琴卷帘至少包括顶部时间轴、左侧钢琴键盘、中间 Note Grid、下方 Velocity Editor。

左侧钢琴键盘显示 C1、C2、C3、C4 等音高提示，黑白键需明显区分。点击钢琴键应向当前 VST 发送试听音符；未加载 VST 时可以没有声音，但 UI 不得报错。

每个 MIDI Note 至少保存 Pitch、Start、Length、Velocity、Mute。Pitch 范围为 0～127，Velocity 范围为 0～127。

---

# 16. 钢琴卷帘工具

钢琴卷帘至少提供 Select、Pen、Scissors、Glue、Mute Tool 五种工具。

Select 支持点击选中、Shift 多选、空白区域框选、移动、调整长度。框选矩形与 Note 相交即可选中。拖动 Note 横向改变 Start，纵向改变 Pitch；移动多个选中 Note 时应保持它们的相对时间与音高关系。

拖动 Note 左右边缘可以改变长度，但不得产生 Length <= 0。

Pen 点击或拖动网格创建音符，纵向位置决定 Pitch，横向拖动距离决定 Length。默认 Velocity 为 100。

Scissors 点击 Note 的时间位置将其切成两条，切割后的两条 Note 必须继承原 Note 的 Pitch、Velocity 和 Mute。

Glue 只能合并相同 Pitch 的音符，不同 Pitch 必须拒绝操作。相同 Pitch 的多条音符可以存在空隙，Glue 后生成一条从最早 Start 到最晚 End 的连续音符，并自动填满中间所有空白。例如 C4 的 1.1～1.2 与 1.3～1.4 合并后得到 1.1～1.4。合并后的 Velocity 与 Mute 使用最左侧 Note 的值。

Mute Tool 点击普通 Note 后将其设为 Muted，Note 显示灰白色且不参与播放；再次点击恢复。Mute Tool 还必须支持框选多个 Note：如果选中区域存在普通或混合状态 Note，则全部设置为 Muted；如果选中 Note 全部已经 Muted，则全部恢复。

---

# 17. 钢琴卷帘 Snap

Piano Roll 的 Snap 默认开启。至少支持 1 Bar、1/2、1/4、1/8、1/16、1/32、1/64。

Snap 至少影响创建 Note、移动 Note、调整 Note 长度和 Scissors 切割位置。按住 Alt 时临时取消 Snap，松开 Alt 恢复；用户也可以手动关闭 Snap，此时允许自由时间位置编辑。

---

# 18. Velocity

钢琴卷帘底部必须提供 Velocity Editor，每个 Note 对应力度控制元素，范围为 0～127。用户拖动力度柱可以修改 Velocity，多选多个 Note 后允许同时调整全部选中 Note 的力度，并对结果执行 0～127 Clamp。

用户还可以直接在 Note 上按住右键并上下拖动改变 Velocity：向上增加，向下减少。拖动期间实时显示当前值，例如 `Velocity: 112`。

音符颜色必须能够反映 Velocity 差异，Velocity 越大，视觉表现越强；Velocity 越小，视觉表现越弱。Muted Note 始终以灰白色显示，不再使用 Velocity 颜色。

VST 实际接收到的 MIDI Velocity 必须和 UI 中显示的数据一致。

---

# 19. MIDI 数据要求

同一时间允许多个 MIDI Note 同时存在和播放。允许同音高 Note 在时间上相互重叠，系统不得自动删除或修正，除非用户主动使用 Glue。

MIDI Note 必须支持 Copy、Paste、Delete、Mute、多选、移动、改 Pitch、改 Velocity、改 Length。Paste 时以当前播放头附近作为插入位置，并遵循当前 Snap。

任何操作都不得产生非法数据，包括负时间、负 Length、NaN、Pitch < 0、Pitch > 127、Velocity < 0、Velocity > 127。

---

# 20. Audio Track 与 WAV

Audio Track 允许通过拖放或文件选择器导入 WAV，并在音轨区生成 Audio Part。

导入 WAV 时必须检查 Sample Rate。文件 Sample Rate 必须和当前工程一致，例如工程 48000 Hz、WAV 44100 Hz 时应拒绝直接导入，并明确显示工程采样率和文件采样率。本版本不要求自动重采样。

Audio Part 至少支持移动、调整起止位置、Scissors、Glue、Delete、Mute、Copy、Paste 和 Duplicate。所有编辑均必须是非破坏性的，不得直接修改原 WAV 文件。

如果工程打开时 WAV 已移动或删除，工程仍应成功打开，对应 Audio Part 显示 Missing File，并允许用户通过 Locate 重新指定文件。

---

# 21. VST Effect 与 Insert

Instrument Track 和 Audio Track 均必须支持 VST Effect Insert。每条轨道应允许加载多个 Effect，并保持明确的处理顺序，例如：音源 → Insert 1 → Insert 2 → Insert 3 → Track Volume/Pan → Master。

用户至少可以添加 Effect、删除 Effect、打开插件 UI、Bypass Effect、调整 Effect 顺序。Bypass 后插件不参与音频处理，但插件实例和参数不得丢失。

Instrument Track 的基本音频路径应在功能意义上等价于：MIDI Notes → VST Instrument → Track Insert Effects → Track Volume → Track Pan → Master。Audio Track 应等价于：WAV → Track Insert Effects → Track Volume → Track Pan → Master。具体内部实现方式不限。

---

# 22. Master

工程始终存在一个 Master Bus，所有可听轨道最终进入 Master。Master 至少提供 Master Volume、Stereo Level Meter 和 Insert Effects。

Master Insert Effects 必须同时影响实时监听和最终 Export。Master Volume 同样必须参与最终导出。

---

# 23. 基础混音

播放过程中允许用户实时修改 Track Volume、Track Pan、Mute、Solo、Effect Bypass、Master Volume。这些操作应尽快反映在实时声音中。

至少每条 Track 和 Master 应显示基础实时电平，用于判断是否存在信号。建议能够明显提示削波，但不要求完整商业级 Meter 功能。

---

# 24. Audio Device

软件必须提供 Audio Settings，并能够搜索当前系统可用的音频驱动和设备，包括可用的 ASIO 等低延迟驱动。

设置页面至少包括 Audio Driver、Output Device、Input Device、Sample Rate、Buffer Size。若设备具有多通道输出，应允许选择左右输出通道。

提供 Refresh Device 功能，使用户连接新声卡后无需重启程序即可重新扫描。

如果工程打开时原使用设备不存在，工程不得打不开或崩溃，而应提示原设备不可用并允许选择其他设备。在没有有效音频输出设备时，应进入 Silent Mode，用户仍可进行 MIDI、Part、插件设置和工程保存，但无法实时听到声音。

---

# 25. Loop

Transport 应允许用户设置 Loop Start 和 Loop End，例如 5.1～9.1。Loop 开启后播放头到达 End 后自动返回 Start 并持续播放。

循环播放期间用户仍然可以进行 MIDI Note 编辑、Velocity 修改、Mute、Track Volume、Pan 和 Mixer 调整，以支持典型 Loop-Based Music Production 工作流。

---

# 26. Undo / Redo

必须支持 Undo 和 Redo，快捷键至少为 Ctrl+Z 和 Ctrl+Shift+Z。

以下操作至少必须进入 Undo 历史：新建/删除 Track、新建/删除/移动/Resize/Split/Glue Part、新建/删除/移动/Resize/Split/Glue Note、Velocity、Mute、Audio Import、VST 切换、Effect 操作、Volume/Pan 调整。

Undo 必须恢复完整的原始状态。例如 Glue 三个 Note 后执行 Undo，应恢复原三条 Note 的精确 Start、Length、Pitch、Velocity 和 Mute，而不是创建“视觉上大致相同”的新数据。

---

# 27. 工程持久化

工程保存后重新打开，必须完整恢复至少以下内容：BPM、Sample Rate、Bit Depth、Track 数量、Track 顺序、Track Name、Track Color、Track Volume、Track Pan、Mute、Solo、VST Instrument、VST Effect、插件顺序、Bypass 状态、Part、MIDI Note、Pitch、Start、Length、Velocity、Mute、Audio File Reference、Loop Range。

保存、实时播放、编辑、重新打开和最终导出必须使用一致的工程状态，不允许出现 UI 数据和实际音频数据不一致。

---

# 28. 音频导出

软件必须提供 Export Audio，至少支持 WAV。

导出范围至少提供 Entire Project 和 Loop Range。Entire Project 默认从工程第一个存在内容的位置渲染到最后一个存在内容的位置。

WAV 导出至少可设置 File Name、Save Location、Sample Rate、Bit Depth、Mono/Stereo，默认与工程设置一致。

导出不能只是简单拼接 WAV，而必须真正包含所有音轨的最终音频结果，包括 Instrument Track 通过 VST Instrument 产生的声音、Audio Track、Track Insert Effects、Volume、Pan、Mute、Solo、Master Insert Effects 和 Master Volume。

Muted Note 和 Muted Track 不得出现在最终声音中。Solo 状态应按照实时播放时相同的逻辑参与导出。

导出时显示 Rendering 和 0%～100% 进度，完成后提示 Export Complete；失败时提供明确原因。

导出结果重新播放时，应与 DAW 中实时播放的最终混音在合理范围内保持一致。

---

# 29. 快捷键最低要求

至少支持：Space 播放/停止；Delete 删除选中对象；Ctrl+Z Undo；Ctrl+Shift+Z Redo；Ctrl+C Copy；Ctrl+V Paste；Ctrl+D Duplicate；Ctrl+S Save。

---

# 30. UI 与交互要求

不要求视觉还原 Cubase，但所有核心功能必须易于发现和操作。工具至少具有 Normal、Hover、Active、Disabled 等必要状态。Part、Note、Muted Note、选中对象、当前工具、当前 Snap、播放头、缺失 VST、缺失 WAV 都必须具有明确视觉区别。

拖动 Part、Resize Part、移动 Note、Resize Note 时必须实时显示视觉预览。移动 Note 时建议显示 Pitch、Start、Length、Velocity 等信息。

---

# 31. 错误处理

以下问题均不得导致软件整体崩溃：VST 加载失败、VST 文件损坏、WAV 损坏、WAV Sample Rate 不匹配、Audio Device 消失、工程引用 WAV 丢失、工程引用 VST 丢失、导出路径不可写、保存路径不可写。

发生错误时必须提供用户可理解的提示，并尽可能允许继续编辑其他内容。

---

# 32. 性能最低要求

工程至少应能够处理 32 Tracks，每轨至少 50 Parts，每个 MIDI Part 至少 1000 Notes。在该规模下，基础选择、移动、播放、缩放和编辑操作不能出现明显无法使用的卡顿。

---

# 33. 核心验收场景：MIDI 制作

新建 120 BPM 工程，创建 Instrument Track，加载 VST，使用 Pen 创建 4 小节 MIDI Part，双击进入 Piano Roll，创建多个音符并设置不同 Velocity，播放后必须能够实际听到 VST 正确演奏。

---

# 34. 核心验收场景：Part Split

创建 1.1～9.1 MIDI Part，并放置一条跨越 5.1 的 Note。在 5.1 使用 Scissors 后，Part 必须变成 1.1～5.1 和 5.1～9.1，跨越该点的 Note 同样切开。执行 Undo 后恢复原始 Part 和原始 Note。

---

# 35. 核心验收场景：Note Glue

创建两个相同 Pitch 的 Note，例如 C4 1.1～1.2 和 C4 1.3～1.4。Glue 后得到 C4 1.1～1.4，中间空白被自动填满。不同 Pitch 的 Note 尝试 Glue 必须失败且原数据不变化。

---

# 36. 核心验收场景：Mute

创建多个 Note，使用 Mute Tool 框选后全部变成灰白色且不再播放；再次框选全部恢复。如果框选对象存在 Muted 和 Normal 混合状态，则统一设置为 Muted。

---

# 37. 核心验收场景：Velocity

创建 Velocity 为 20、64、127 的三条 Note，三者必须具有明显不同的视觉颜色强度，播放时 VST 接收到对应 Velocity。通过底部 Velocity Editor 和右键上下拖动均能修改 Velocity。

---

# 38. 核心验收场景：Snap

Piano Roll 设置 Snap = 1/16，移动和绘制 Note 时自动吸附到 1/16 网格；按住 Alt 后可以自由移动到网格之间，松开后恢复吸附。音轨区 Snap 默认关闭，也必须具备相应临时切换行为。

---

# 39. 核心验收场景：多轨音乐制作

建立一个至少 16 小节、120 BPM 的工程，创建 Drums、Bass、Piano、Lead 四条 Instrument Track，并分别加载独立 VST，再创建一条 Audio Track 导入 WAV。

Drums 至少制作 Kick、Snare、Hi-Hat；Bass 至少使用 4 个不同 Pitch；Piano 至少包含一个同时触发的三音和弦；Lead 至少包含 8 个 MIDI Notes；Audio Track 包含一段合法 WAV。

五条轨道必须可以同步同时播放。切换当前选中轨不得中断其他轨道。

---

# 40. 核心验收场景：基础混音

将 Drums Pan 设为 Center、Bass 为 Center、Piano 为 L30、Lead 为 R30、Audio 为 Center，并设置不同 Track Volume。播放时应该能够明显听到不同轨道共同形成的 Stereo Mix。

单独 Solo Bass 时只能听到 Bass；同时 Solo Bass 和 Piano 时只能听到这两条；取消全部 Solo 后恢复所有非 Mute 轨道。

---

# 41. 核心验收场景：VST Effect

在 Piano Track 加载至少一个 VST Effect，在 Master 加载另一个 VST Effect。实时播放时必须可以听到处理结果。

Bypass Piano Effect 后该效果应消失，但插件和参数保留；重新启用后效果恢复。Master Effect 必须影响所有最终经过 Master 的声音。

---

# 42. 核心验收场景：Audio Import

工程设置为 48000 Hz，导入 48000 Hz WAV 时成功生成 Audio Part；导入 44100 Hz WAV 时拒绝，并显示双方 Sample Rate。

---

# 43. 核心验收场景：缺失资源

保存一个使用 Plugin A 和某 WAV 文件的工程，然后让 Plugin A 和 WAV 不可用，再重新打开。工程必须成功打开，MIDI 和其他轨道完整，插件位置显示 Missing Plugin，Audio Part 显示 Missing File，并允许重新 Locate WAV。

---

# 44. 核心验收场景：工程持久化

建立至少 5 条 Track、20 个 Parts、100 个 MIDI Notes，设置不同 Velocity、Mute、Volume、Pan、VST 和 Effect 后保存。关闭软件并重新打开，所有核心状态必须与保存前一致。

---

# 45. 核心验收场景：最终导出

使用上述多轨工程执行 Export WAV。导出结果必须包含 Drums、Bass、Piano、Lead、Audio Track，并包含 Track Volume、Pan、Insert Effect、Master Effect、Master Volume 的影响；Mute 的 Track 或 Note 不得出现。最终 WAV 能够被正常播放器打开并实际播放完整音乐。

---

# 46. 最终完成标准

只有当产品能够真正完成以下闭环时，才视为核心任务通过：启动软件，新建 44.1 kHz / 24 bit 工程，选择可用 Audio Device，创建多个 Instrument Track，分别加载多个 VST Instrument，创建和编辑多个 MIDI Part，在钢琴卷帘中完成音符、和弦、鼓组、Bass、旋律、Velocity、Mute、Scissors、Glue 和 Snap 编辑；创建 Audio Track 并导入合法 WAV；多轨同步实时播放；调整 Volume、Pan、Mute、Solo；加载 Track Effect 与 Master Effect；保存工程并重新打开且状态完整；最终渲染导出一份包含全部有效轨道和效果的 Stereo WAV。

如果产品只能显示 DAW 界面、绘制音符、打开单个 VST 或模拟音轨操作，但不能实现真实的多轨同步播放、VST 音频链路、混音和最终 WAV 渲染，则不能视为完成本 PRD。

最终验收应要求测试者能够使用该产品实际制作并导出一个至少 16 小节的多轨音乐 Demo。该 Demo 至少应包含鼓、Bass、和弦、旋律和一条 Audio Track，并且能够保存、重新打开和再次导出。