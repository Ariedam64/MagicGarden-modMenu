import type { SpriteItem } from '../types';

export interface GridHandles {
  items: SpriteItem[];
}

export function createGrid(): GridHandles {
  return { items: [] };
}

export function updateGrid(grid: GridHandles, items: SpriteItem[]) {
  grid.items = items;
}
