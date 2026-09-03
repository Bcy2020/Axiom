# 重建 PRD：功能级规格说明

> 由"重建代理"根据 decomposition_dump.md 重述，非 PRD 原文。

## 一、工程系统
| 功能 | 来源块 |
|---|---|
| 新建工程：弹出设置窗口，指定采样率(44100/48000/88200/96000)、位深(16/24/32f)、BPM(20-300)、拍号(默认4/4) | blk_project |
| 打开工程：加载工程文档(轨/Part/MIDI Note/插件实例/循环范围等) | blk_project |
| 保存/另存工程：写回磁盘；脏标记感知 | blk_project |
| 自动保存：定期自动保存 | blk_project |
| 工程参数校验：采样率/位深/BPM 合法范围校验 | blk_project |
| 脏状态退出提示 | blk_project |
| 完整状态恢复（Undo/崩溃恢复） | blk_project |

## 二、播放控制（Transport）
| 功能 | 来源块 |
|---|---|
| Play；独立主时钟各轨同步不漂移 | blk_transport |
| Pause | blk_transport |
| Stop；返回开始 | blk_transport |
| 播放头定位/标尺点击 | blk_transport |
| Loop 开关；设置循环范围；循环期间编辑 | blk_transport |
| BPM 时钟控制 | blk_transport |

## 三、音轨系统
| 功能 | 来源块 |
|---|---|
| 添加 Instrument 轨(≥32)；添加 Audio 轨 | blk_tracks |
| 重命名；音量(独立于 Velocity)；Pan(L100~Center~R100) | blk_tracks |
| 颜色标记 | blk_tracks |
| Mute；Solo（多选逻辑） | blk_tracks |
| 拖拽重排 | blk_tracks |

## 四、VST 插件系统
| 功能 | 来源块 |
|---|---|
| VST 扫描(区分 Instrument/Effect/失败标记) | blk_plugins |
| 插件实例创建；重新选择/切换；打开插件 UI | blk_plugins |
| 添加/删除/Bypass/调整顺序 Effect Insert | blk_plugins |
| Missing Plugin 处理 | blk_plugins |

## 五、音轨区编辑器（Arranger）
| 功能 | 来源块 |
|---|---|
| Part 模型；同轨重叠均参与播放 | blk_partmodel |
| Select/Pen/Scissors/Glue 工具 | blk_parttools |
| Copy/Paste/Duplicate；End>Start 校验 | blk_parttools |
| 双击打开 Part | blk_parttools |
| 音轨区 Snap(默认关 4 精度 Alt) | blk_arrangerview |
| 滚动/缩放；Auto Follow | blk_arrangerview |

## 六、钢琴卷帘编辑器（Piano Roll）
| 功能 | 来源块 |
|---|---|
| MIDI Note 模型；非法数据防护 | blk_noteedit |
| Select/Pen/Scissors/Glue/Mute Tool | blk_noteedit |
| Note 自动延伸；音符重叠允许(polyphony) | blk_noteedit |
| 钢琴卷帘 Snap；粘贴到播放头 | blk_noteedit |
| Velocity 编辑；右键拖动；颜色反映；Clamp；VST 同步 | blk_velocity |
| 钢琴键试听 | blk_prview |
| 视图滚动缩放；最大化；双击打开 | blk_prview |

## 七、音频引擎与混音
| 功能 | 来源块 |
|---|---|
| 实时多轨渲染；polyphony | blk_audiochain |
| 信号链路(Instrument: MIDI→VST→Insert→Vol→Pan→Master；Audio: WAV→Insert→Vol→Pan→Master) | blk_audiochain |
| Master 总线(Master Volume/Mute/Solo) | blk_audiochain |
| 实时混音 | blk_audiochain |
| 实时电平(每轨/Master)；削波 | blk_meter |
| 音频设备配置(含 ASIO)；刷新设备 | blk_audiodevice |
| 设备缺失静音模式 | blk_audiodevice |

## 八、WAV 音频导入
| 功能 | 来源块 |
|---|---|
| 拖放导入；文件选择器导入；采样率校验 | blk_import |
| 非破坏性编辑；缺失文件定位(Locate) | blk_import |

## 九、音频导出
| 功能 | 来源块 |
|---|---|
| 离线渲染 WAV；导出范围设置；真实混音(Mute/Solo/Insert/Vol/Pan/Master)；进度；失败处理 | blk_export |

## 十、撤销/重做
| 功能 | 来源块 |
|---|---|
| Undo/Redo；历史栈管理；精确对象状态恢复 | blk_undo |

## 十一、主界面框架（App Shell）
| 功能 | 来源块 |
|---|---|
| 五区域布局；状态展示(工具/选中/播放头/Snap/BPM/播放/脏标记) | blk_appshell |
| 快捷键路由；工具状态 UI；拖拽实时预览 | blk_appshell |
| 性能等级提示；错误与稳定性(不崩溃) | blk_appshell |

## 附件 + 验收场景映射简述
- 验收场景 ac_33..ac_46 映射到：parttools / noteedit / velocity / audiochain / plugins / import / project / export / appshell。
