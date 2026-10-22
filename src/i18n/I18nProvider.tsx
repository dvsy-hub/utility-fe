'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { createTranslator, type Locale } from './translator';
import { I18nContext } from './use-i18n';

interface I18nProviderProps {
  readonly locale: Locale;
  readonly children: ReactNode;
}

export function I18nProvider({ locale, children }: I18nProviderProps) {
  const translator = useMemo(() => createTranslator(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext value={translator}>{children}</I18nContext>;
}
