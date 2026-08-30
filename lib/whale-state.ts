// 全屏鲸实时状态广播层——「发光龙」式文字交互的数据桥
// FloatingWhale 每帧写入（rAF 内直写，零 React 渲染开销），
// WhaleLetter（实时绕排）/ HeroLines（逐字照亮）在各自 rAF 里直读。
// 坐标系：viewport 客户区坐标（与 getBoundingClientRect 同系）。
export interface WhaleState {
  /** 鲸中心 x（css px，viewport 坐标） */
  x: number;
  /** 鲸中心 y（css px，viewport 坐标） */
  y: number;
  /** 水平速度（px/s，供文字受扰方向参考） */
  vx: number;
  /** 绘制比例（~0.58-0.9，随视口宽度），文字绕排用它换算鲸身椭圆半轴 */
  scale: number;
  /** 首帧生效前为 false——消费方据此回退静态排版 */
  active: boolean;
}

export const whaleState: WhaleState = {
  x: 0,
  y: 0,
  vx: 0,
  scale: 0.9,
  active: false,
};
