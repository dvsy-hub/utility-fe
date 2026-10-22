'use client';

import { createContext, use } from 'react';
import type { Translator } from './translator';

export const I18nContext = createContext<Translator | null>(null);

export function useI18n(): Translator {
  const translator = use(I18nContext);
  if (translator === null) throw new Error('useI18n must be used inside <I18nProvider>');
  return translator;
}
