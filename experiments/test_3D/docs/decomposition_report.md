# 3D建模工具 - 验收驱动分解报告

## 一、技术栈与功能评估

### 技术栈建议
- **编程语言**: TypeScript/JavaScript
- **图形渲染**: WebGL (Three.js 或原生)
- **GUI框架**: Electron + React
- **数据存储**: 自定义JSON格式
- **几何计算**: 自定义B-rep实现

### 规模评估
- **复杂度**: 中高（涉及图形渲染、几何计算、UI交互）
- **主要模块**: 8个功能块
- **触发器**: 20个
- **数据源**: 5个

---

## 二、功能块图结构

```
┌─────────────────────────────────────────────────────────────────┐
│                        blk_app (3D建模应用)                      │
│  目的: 提供完整的3D建模交互体验                                  │
│  输入: 用户输入事件, 面板参数                                    │
│  输出: 渲染画面, UI状态                                          │
│  数据操作: ds_scene(RW), ds_input(R), ds_render(RW), ds_persist(RW)│
└────┬──────┬───────┬────────┬──────────┬─────────┬────────┘
     │      │       │        │          │         │        │
     ▼      ▼       ▼        ▼          ▼         ▼        ▼
┌─────────┐┌────────┐┌─────────┐┌──────────┐┌─────────┐┌────────┐┌─────────┐
│blk_viewport│blk_sketch│blk_geometry3d│blk_transform│blk_boolean│blk_material│blk_persist│
│ 视口管理  │ 2D草图工具│  3D几何生成  │  Gizmo变换  │ 布尔运算  │ 材质编辑  │持久化管理 │
│          │          │           │           │          │          │          │
│ •视角旋转 │ •线段    │ •拉伸     │ •平移     │ •并集    │ •颜色修改 │ •导出    │
│ •视角平移 │ •圆形    │ •扫描     │ •旋转     │ •交集    │ •透明度  │ •导入    │
│ •正交切换 │ •贝塞尔  │ •旋转体   │           │          │ •预设模板│          │
│ •网格吸附 │ •多边形  │ •抽壳     │           │          │          │          │
│          │ •椭圆    │           │           │          │          │          │
│          │ •自动分割 │           │           │          │          │          │
└─────────┘└────────┘└─────────┘└──────────┘└─────────┘└────────┘└─────────┘
```

---

## 三、数据源

| ID | 名称 | 类别 | 访问模式 | 实体 |
|---|---|---|---|---|
| ds_scene | 场景数据 | db | read_write | 模型对象、材质、变换、分组层级 |
| ds_input | 用户输入 | input | read | 鼠标事件、键盘事件、面板参数 |
| ds_geometry | 几何计算缓存 | cache | read_write | 线段相交结果、区域分割结果、拓扑关系 |
| ds_render | 渲染状态 | cache | read_write | 帧缓冲、绘制调用、裁剪区域 |
| ds_persist | 持久化文件 | fs | read_write | 场景文件、材质配置 |

---

## 四、触发器覆盖矩阵

| PRD条目 | 触发器 | 目标块 | 状态 |
|---|---|---|---|
| 一.1 | trg_grid_snap (网格吸附) | blk_sketch | ✅ covered |
| 一.2.1 | trg_rotate_camera (旋转视角) | blk_viewport | ✅ covered |
| 一.2.2 | trg_pan_camera (平移视角) | blk_viewport | ✅ covered |
| 一.2.3 | trg_switch_to_ortho (切换正交) | blk_viewport | ✅ covered |
| 二.线段 | trg_draw_line (绘制线段) | blk_sketch | ✅ covered |
| 二.圆形 | trg_draw_circle (绘制圆形) | blk_sketch | ✅ covered |
| 二.贝塞尔曲线 | trg_draw_bezier (绘制贝塞尔) | blk_sketch | ✅ covered |
| 二.正多边形 | trg_draw_polygon (绘制多边形) | blk_sketch | ✅ covered |
| 二.椭圆 | trg_draw_ellipse (绘制椭圆) | blk_sketch | ✅ covered |
| 四.1 | trg_extrude (拉伸) | blk_geometry3d | ✅ covered |
| 四.2 | trg_sweep (扫描) | blk_geometry3d | ✅ covered |
| 四.3 | trg_revolve (旋转体) | blk_geometry3d | ✅ covered |
| 四.4 | trg_shell (抽壳) | blk_geometry3d | ✅ covered |
| 六.1 | trg_translate_gizmo (Gizmo平移) | blk_transform | ✅ covered |
| 六.2 | trg_rotate_gizmo (Gizmo旋转) | blk_transform | ✅ covered |
| 七.1 | trg_boolean_union (并集) | blk_boolean | ✅ covered |
| 七.1 | trg_boolean_intersection (交集) | blk_boolean | ✅ covered |
| 七.3 | trg_material_edit (材质编辑) | blk_material | ✅ covered |
| 数据持久化 | trg_export_scene (导出) | blk_persist | ✅ covered |
| 数据持久化 | trg_import_scene (导入) | blk_persist | ✅ covered |

**覆盖率**: 18/18 (100%)

---

## 五、触发连线明细

| 触发器 | 目标块 | 效果 | 数据源变更 |
|---|---|---|---|
| trg_rotate_camera | blk_viewport | 更新相机旋转矩阵 | ds_render: read_write |
| trg_pan_camera | blk_viewport | 更新相机位置 | ds_render: read_write |
| trg_switch_to_ortho | blk_viewport | 切换投影模式为俯视正交 | ds_render: read_write |
| trg_draw_line | blk_sketch | 创建线段几何体 | ds_scene: write, ds_geometry: write |
| trg_draw_circle | blk_sketch | 创建圆形几何体 | ds_scene: write, ds_geometry: write |
| trg_draw_bezier | blk_sketch | 创建贝塞尔曲线 | ds_scene: write, ds_geometry: write |
| trg_draw_polygon | blk_sketch | 创建正多边形 | ds_scene: write, ds_geometry: write |
| trg_draw_ellipse | blk_sketch | 创建椭圆 | ds_scene: write, ds_geometry: write |
| trg_extrude | blk_geometry3d | 拉伸2D面生成3D体 | ds_scene: write, ds_geometry: write |
| trg_sweep | blk_geometry3d | 沿路径扫描生成3D体 | ds_scene: write, ds_geometry: write |
| trg_revolve | blk_geometry3d | 旋转生成3D体 | ds_scene: write, ds_geometry: write |
| trg_shell | blk_geometry3d | 对3D体抽壳 | ds_scene: write, ds_geometry: write |
| trg_boolean_union | blk_boolean | 执行并集运算 | ds_scene: write, ds_geometry: write |
| trg_boolean_intersection | blk_boolean | 执行交集运算 | ds_scene: write, ds_geometry: write |
| trg_translate_gizmo | blk_transform | 沿轴向平移物体 | ds_scene: write |
| trg_rotate_gizmo | blk_transform | 旋转物体（局部欧拉角） | ds_scene: write |
| trg_material_edit | blk_material | 更新物体材质属性 | ds_scene: write |
| trg_export_scene | blk_persist | 导出场景数据到文件 | ds_persist: write |
| trg_import_scene | blk_persist | 从文件导入场景 | ds_scene: write, ds_persist: read |
| trg_grid_snap | blk_sketch | 吸附到网格点 | ds_scene: read |

---

## 六、分解自查结果

### 6a. PRD绑定覆盖矩阵
- **覆盖条目**: 18/18
- **未覆盖条目**: 0
- **状态**: ✅ 全部覆盖

### 6b. 触发调用树
- 所有触发器均已正确连线到目标块
- 数据源变更符合预期
- 无遗漏分支

### 6c. PRD重建比对
- **缺失**: 无
- **失真**: 无
- **多余**: 无

---

## 七、结论

✅ **分解通过所有自查闸门**

- 18个PRD功能条目全部覆盖
- 8个功能块合理划分职责
- 5个全局状态源定义清晰
- 双守恒（接口 + 全局状态）满足
- 触发连线完整，无遗漏
