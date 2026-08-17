export type ChartViewportState = {
  startTime: number;
  endTime: number;
  visibleCandles: number;
};

export function chartViewportSignature(viewport: ChartViewportState): string {
  return `${viewport.startTime}:${viewport.endTime}:${viewport.visibleCandles}`;
}

export function shouldEmitChartViewport(previousSignature: string | null, viewport: ChartViewportState): boolean {
  return previousSignature !== chartViewportSignature(viewport);
}
