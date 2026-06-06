export type DiffOperation = 'equal' | 'insert' | 'delete';

export interface DiffPart {
  op: DiffOperation;
  value: string;
}

export interface TrackingSnapshot {
  baselineText: string;
  baselineHtml?: string;
  capturedAt: string;
  scope: 'full' | 'selection';
}

export const REDLINE_STYLES = {
  delete: 'color:red;text-decoration:line-through',
  insert: 'color:blue;text-decoration:underline',
} as const;
