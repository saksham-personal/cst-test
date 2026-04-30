import { useKeywordColorStore } from '../stores/keywordColorStore';
import { KEYWORD_COLORS } from '../theme/keywordColors';

export function useKeywordColors() {
  const { colorMap } = useKeywordColorStore();

  return (keywordId: string, index?: number) => {
    if (colorMap[keywordId] !== undefined) {
      return KEYWORD_COLORS[colorMap[keywordId]];
    }
    const idx = index !== undefined ? index : 0;
    return KEYWORD_COLORS[idx % KEYWORD_COLORS.length];
  };
}
