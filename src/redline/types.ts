export type DiffOperation = 'equal' | 'insert' | 'delete';

export interface DiffPart {
  op: DiffOperation;
  value: string;
}

export interface SelectionAnchors {
  prefix: string;
  suffix: string;
  baselineText: string;
  /** Plain-text offset at capture time — disambiguates duplicate matches on relocate. */
  regionStart: number;
  /** Plain-text end offset at capture time. */
  regionEnd: number;
}

export interface TrackingSnapshot {
  baselineText: string;
  baselineHtml?: string;
  capturedAt: string;
  scope: 'full' | 'selection';
  anchors?: SelectionAnchors;
  /** Plain-text map at capture — stabilizes region offsets on unchanged drafts. */
  captureBodyPlain?: string;
}

export const REDLINE_STYLES = {
  delete: 'color:red;text-decoration:line-through',
  insert: 'color:blue;text-decoration:underline',
} as const;
