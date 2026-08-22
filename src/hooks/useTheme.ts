import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  readThemeChoice,
  resolveTheme,
  storeThemeChoice,
  watchSystemTheme,
  type ThemeChoice,
} from '@/lib/theme';

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);

  useEffect(() => watchSystemTheme(() => applyTheme(readThemeChoice())), []);

  const select = useCallback((next: ThemeChoice) => {
    storeThemeChoice(next);
    applyTheme(next);
    setChoice(next);
  }, []);

  return { choice, resolved: resolveTheme(choice), select };
}
