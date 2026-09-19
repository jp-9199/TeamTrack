'use client';

import React, { useState } from 'react';
import {
  FluentProvider,
  teamsLightTheme,
  SSRProvider,
  RendererProvider,
  createDOMRenderer,
  renderToStyleElements,
} from '@fluentui/react-components';
import { useServerInsertedHTML } from 'next/navigation';

export function FluentClientProvider({ children }: { children: React.ReactNode }) {
  const [renderer] = useState(() => createDOMRenderer());

  useServerInsertedHTML(() => {
    return <>{renderToStyleElements(renderer)}</>;
  });

  return (
    <RendererProvider renderer={renderer}>
      <SSRProvider>
        <FluentProvider theme={teamsLightTheme} style={{ width: '100%', height: '100%', background: 'transparent' }}>
          {children}
        </FluentProvider>
      </SSRProvider>
    </RendererProvider>
  );
}
