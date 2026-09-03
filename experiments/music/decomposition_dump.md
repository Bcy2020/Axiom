# 分解产物转储（供重建代理审阅；不含需求原文）

本文件是 acceptance-driven 分解库的导出。**只含结构/行为描述，不含源 PRD 文本。**请据此重述"这套分解能实现的功能"。

## 数据源（8 个）

| id | name | category | access | 描述 |
|---|---|---|---|---|
| ds_project | 工程文档 | db | read_write | 工程设置(采样率/位深/BPM/拍号)+轨+Part+MIDI Note+插件实例+循环范围+脏标记 |
| ds_undo | Undo/Redo 历史栈 | cache | read_write | undo_stack/redo_stack |
| ds_transport | Transport 主时钟 | cache | read_write | play_state/playhead/loop/bpm_clock |
| ds_device | 音频设备/驱动 | external | read_write | 驱动列表/输出/输入/buffer/通道/设备状态/静音模式 |
| ds_vst | VST 插件注册表与实例 | db | read_write | 搜索目录/扫描结果(Instrument/Effect)/失败标记/实例/效果链/bypass |
| ds_wav | WAV 音频资产 | fs | read | wav 文件/采样率/音频数据/播放范围/缺失标记/locate |
| ds_audioengine | 音频引擎缓冲 | cache | read_write | 实时混音缓冲/每轨电平/master 电平/削波 |
| ds_editor | 编辑会话状态 | cache | read_write | 音轨区工具/钢琴卷帘工具/选中/Snap/视图/active_part/autofollow |

## 功能块（20 个）

### 顶层子系统块（parent = null）
- **blk_appshell 主界面框架**：五区域布局/可拖分割线；状态展示(工具/选中/播放头/Snap/BPM/播放/脏状态)；快捷键路由；工具 Normal/Hover/Active/Disabled 状态与视觉区分；拖拽实时预览。
- **blk_project 工程系统**：新建(设置窗口)/打开/保存/另存/自动保存/脏状态；工程参数校验(采样率{44100,48000,88200,96000}、位深{16,24,32f}、BPM20-300、4/4 拍默认 44100/24/120)。
- **blk_transport 主时钟与 Transport**：Play/Pause/Stop/返回开始、播放头定位与标尺点击、Loop 开关与循环、BPM 时钟；独立主时钟各轨不漂移。
- **blk_tracks 音轨系统**：添加 Instrument/Audio 轨(≥32)、重命名/Volume(独立于 Velocity)/Pan(L100~Center~R100)/颜色、Mute/Solo 多选逻辑、拖拽重排。
- **blk_plugins VST 插件系统**：扫描目录(区分 Instrument/Effect/失败标记)、实例创建/选择/切换/开 UI、Effect Insert(添加/删除/Bypass/调顺序)、Missing Plugin 处理。
- **blk_arranger 音轨区编辑器**：Part 模型(MIDI/Audio、重叠)、Select/Pen/Scissors/Glue、Copy/Paste/Duplicate、音轨区 Snap、滚动缩放/自动跟随。
- **blk_pianoroll 钢琴卷帘编辑器**：MIDI Note 模型、Select/Pen/Scissors/Glue/Mute Tool、钢琴卷帘 Snap、Velocity 编辑、钢琴键试听、滚动缩放/最大化/双击打开。
- **blk_audio 音频引擎与混音**：实时多轨渲染、信号链、Master、电平、音频设备。
- **blk_import WAV 导入**：拖放/选择器导入生成 Audio Part、采样率校验、非破坏性、Missing File/Locate。
- **blk_export 音频导出**：离线渲染 WAV(范围/设置/真实混音/进度/失败)、Mute/Solo/Master 逻辑。
- **blk_undo Undo/Redo 管理**：历史栈、精确恢复完整对象状态。

### 子块
- **blk_audiochain 实时渲染信号链**（blk_audio 子块）：Instrument(MIDI→VST Instrument→Insert Effect→Volume→Pan) 与 Audio(WAV→Insert Effect→Volume→Pan) 汇入 Master；单主时钟同步不漂移。
- **blk_meter 实时电平与 Meter**（blk_audio 子块）：每轨与 Master 实时电平、削波提示。
- **blk_audiodevice 音频设备配置**（blk_audio 子块）：搜驱动/设备(含 ASIO)、配置 Driver/Output/Input/SR/Buffer/左右通道、Refresh、缺失→静音模式。
- **blk_partmodel Part 模型**（blk_arranger 子块）：Part 结构，同轨重叠均参与播放。
- **blk_parttools Part 工具与选择**（blk_arranger 子块）：Select/Pen/Scissors/Glue、双击打开、clipboard、End>Start。
- **blk_arrangerview 音轨区视图与 Snap**（blk_arranger 子块）：滚动/缩放/Auto Follow、音轨区 Snap(默认关 4 精度 Alt)。
- **blk_noteedit MIDI Note 模型与工具**（blk_pianoroll 子块）：Note 模型(非法数据防护)、Select/Pen/Scissors/Glue/Mute Tool、钢琴卷帘 Snap。
- **blk_velocity Velocity 编辑**（blk_pianoroll 子块）：Velocity Editor、右键拖动、颜色反映、Clamp、VST 同步。
- **blk_prview 钢琴卷帘视图与键盘**（blk_pianoroll 子块）：时间轴/键盘/Note Grid/Velocity Editor 区、钢琴键试听、滚动缩放/最大化。

## 触发连线（90 条，trigger → 块，effect 摘要）

- trig_new_project/save/as/open/autosave/dirty_exit/change_bpm → blk_project
- trig_play/pause/stop/click_ruler_playhead/loop_toggle/master_clock → blk_transport
- trig_toggle_pianoroll_max → blk_appshell
- trig_arranger_zoom/autofollow → blk_arrangerview
- trig_add_track/set_track_params/track_reorder/track_color/mute_solo → blk_tracks
- trig_create_inst_track_vst/reselect_vst/open_plugin_ui/vst_scan/missing_plugin → blk_plugins
- trig_multi_track_simult/polyphony → blk_audiochain
- trig_overlap_parts → blk_partmodel
- trig_part_select/pen/scissors/glue/part_edit_shortcuts → blk_parttools
- trig_arranger_snap → blk_arrangerview
- trig_open_pianoroll → blk_prview
- trig_note_auto_extend/note_select/note_pen/note_scissors/note_glue/note_mute_tool/pianoroll_snap/note_overlap_allow/midi_paste_playhead/midi_no_illegal → blk_noteedit
- trig_pianokey_preview → blk_prview
- trig_velocity_editor/rightclick/color/vst_sync → blk_velocity
- trig_import_wav/wav_sample_rate/wav_missing_locate → blk_import
- trig_add_effect_insert/effect_manage → blk_plugins
- trig_master_controls/realtime_mix → blk_audiochain
- trig_level_meter → blk_meter
- trig_audio_settings/device_config/refresh_device/device_missing_silent → blk_audiodevice
- trig_set_loop_range/edit_during_loop → blk_transport
- trig_undo/redo/undo_history_coverage → blk_undo
- trig_restore_project/state_consistency → blk_project
- trig_export_audio → blk_export
- trig_keyboard_shortcuts/tool_states_ui/realtime_preview/error_no_crash/performance_scale → blk_appshell
- 验收场景 ac_33..ac_46 → 对应块（MIDI制作/Note Split→parttools；Note Glue/Mute/Snap/MIDI→noteedit；Velocity→velocity；多轨/混音→audiochain；VST Effect/Missing→plugins；Audio Import→import；持久化→project；导出→export；最终→appshell）
