# 分解产物数据（仅用作"重建"输入；不得参考 PRD 原文）

这是验收驱动分解生成的**功能块图**数据。请**仅依据本文件**重述该工具能实现的功能（功能级重建，不是块树级重建）。

## 一、全局状态源（数据从哪来/到哪去）
- `ds_scene`（db, read_write）：场景模型数据（3D实体/2D面/变换/分组/材质绑定）
- `ds_sketch_geom`（db, read_write）：2D草图几何（线段/圆/贝塞尔/正多边形/椭圆）
- `ds_face_topology`（db, read_write）：2D面自动分割拓扑（闭合区域/相交分割/有界区域）
- `ds_material_lib`（cache, read）：预设材质模板库（塑料/金属/玻璃/木材）
- `ds_viewport`（cache, read_write）：视口/相机状态（相机/视图模式/网格/吸附设置）
- `ds_scene_file`（fs, read_write）：导出/导入场景文件

## 二、分层功能块图（父→子，每块标注职责）
- `blk_app`（3D建模主应用）：统一入口，接管用户交互，协调各功能模块，输出视口画面与导出/导入文件。边界 out_of_scope 明确：**严禁使用任何提供完整B-rep建模能力或一键式3D编辑器全流程的现成SDK**（允许适当选用外部库辅助**非核心**业务逻辑，如数学计算/几何相交判定/UI组件；核心建模自研）。
  - `blk_viewport`（视口与相机控制）
    - `blk_view_orbit`：右键拖拽旋转三维视角
    - `blk_view_pan`：中键拖拽平移视角
    - `blk_view_ortho_top`：切换俯视正交投影（=草图模式，2D落于Z=0）；**不设独立2D界面区，退出俯视即为3D观察/编辑模式**（俯视正交即"草图模式"）。
    - `blk_view_grid_snap`：自适应网格 + 网格吸附（绘制/位移）
  - `blk_sketch`（2D草图工具集）
    - `blk_sketch_line`：线段（自由两点/参数起点+长度）
    - `blk_sketch_circle`：圆形（自由圆心+圆上点/参数圆心+半径）
    - `blk_sketch_bezier`：贝塞尔曲线（仅自由绘制，多点）
    - `blk_sketch_polygon`：正多边形（自由一条边+边数/参数中心+边长+边数）
    - `blk_sketch_ellipse`：椭圆（自由两焦点+圆上点/参数两焦点+离心率）
  - `blk_topology`（2D面自动分割拓扑）：仅识别有界闭合区域；**单独的圆仅产生内部一个面**；新线条相交时自动分割原闭合区生成独立可点选面对象；无穷远/未围合区域不生成面。**性能：≥100条独立线段/曲线相交与分割计算耗时≤500ms。**
  - `blk_primitive`（3D基础几何体）
    - `blk_prim_box`：长方体基元
    - `blk_prim_sphere`：球体基元
    - `blk_prim_torus`：甜甜圈形基元
    （三种基元在数据结构/材质/布尔参与度上与2D生成3D体完全等价）
  - `blk_gen3d`（3D生成工具集）
    - `blk_gen_extrude`：选中2D面沿其平面法向拉伸给定高度生成实体
    - `blk_gen_sweep`：选中2D面+任意空间曲线，沿路径Frenet-Serret扫描生成实体（截面始终垂直路径切线；路径起点无需与截面相交）
    - `blk_gen_revolve`：选中2D面+旋转轴+旋转角度生成旋转体
    - `blk_gen_shell`：选中3D体输入厚度生成均匀厚度空心壳体
    - `blk_gen_overlap_parity`：重叠处理统一规则——默认关闭=重叠保留并累加（覆盖两次仍是实体）；开启"自动布尔减"后按奇偶规则切换实体/空洞状态（第1次=实体，第2次=空洞，第3次=实体…奇=实体偶=空洞）；该开关对拉伸/扫描/旋转统一生效。
  - `blk_transform`（Gizmo变换）
    - `blk_translate`：显示X/Y/Z轴向箭头，拖拽箭头使物体沿轴平移
    - `blk_rotate`：显示三轴旋转把柄，旋转采用局部欧拉角，把柄轴向实时跟随物体自身旋转（与物体局部坐标对齐，非固定世界轴）
  - `blk_edit`（高级编辑与材质）
    - `blk_edit_boolean`：对两个已有独立3D体执行并集/交集（独立显式操作，与自动布尔减开关无关）
    - `blk_edit_merge_group`：将多个3D体合并为逻辑组，组内任一被选中则全部高亮联动
    - `blk_edit_material`：修改颜色/透明度，选用预设材质模板——初始哑光塑料(无高光)/金属(高光反射光泽)/玻璃(透明菲涅尔效应)/木材(粗糙漫反射)，渲染用光照模型区分各模板，材质切换与参数修改实时响应(<100ms)
  - `blk_select`（选择工具）：拖拽矩形框选多个物体（2D面或3D体）
  - `blk_render`（渲染管线）：视口渲染，视锥裁剪（不渲染视口外物体）、LOD/几何简化(建议)、光照/材质渲染，**在符合最低硬件配置标准的设备上**保证交互渲染帧率≥30FPS（理想60FPS，单帧≤33ms），**并流畅处理≥50个独立3D实体场景**；材质切换与参数修改实时响应(<100ms)。
  - `blk_persistence`（导出/导入）
    - `blk_persist_export`：将场景全部模型数据（几何/材质/变换/分组层级）导出为文件
    - `blk_persist_import`：从文件重新导入恢复完整场景

## 三、触发→块连线摘要（哪个块实现哪个功能行为）
- 视角：orbit→blk_view_orbit；pan→blk_view_pan；ortho_top→blk_view_ortho_top；grid_snap→blk_view_grid_snap
- 草图：line/circle/bezier/polygon/ellipse→对应的 blk_sketch_*
- 基元：box/sphere/torus→对应的 blk_prim_*
- 生成：extrude→blk_gen_extrude；sweep→blk_gen_sweep；revolve→blk_gen_revolve；shell→blk_gen_shell；overlap_rule→blk_gen_overlap_parity
- 拓扑：auto_segment→blk_topology
- 变换：translate→blk_translate；rotate→blk_rotate
- 编辑：bool_union/intersect→blk_edit_boolean；merge_group→blk_edit_merge_group；edit_material→blk_edit_material
- 选择：box_select→blk_select
- 持久化：export→blk_persist_export；import→blk_persist_import
- 渲染：render_pipeline→blk_render
