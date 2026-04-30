import { create } from 'zustand';
import { KEYWORD_COLORS } from '../theme/keywordColors';

interface KeywordColorState {
  colorMap: Record<string, number>;
  nextColorIndex: number;
  getColorForKeyword: (keywordId: string) => typeof KEYWORD_COLORS[0];
}

export const useKeywordColorStore = create<KeywordColorState>((set, get) => ({
  colorMap: {},
  nextColorIndex: 0,
  getColorForKeyword: (keywordId: string) => {
    const { colorMap, nextColorIndex } = get();
    
    if (keywordId in colorMap) {
      return KEYWORD_COLORS[colorMap[keywordId]];
    }

    const assignedIndex = nextColorIndex;
    const newNext = (nextColorIndex + 1) % KEYWORD_COLORS.length;
    
    set({
      colorMap: { ...colorMap, [keywordId]: assignedIndex },
      nextColorIndex: newNext,
    });
    
    return KEYWORD_COLORS[assignedIndex];
  },
}));
