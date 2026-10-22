import { connection } from 'next/server';
import { FatalScreen } from '@/app-shell/FatalScreen';
import { MiniApp } from '@/app-shell/MiniApp';
import { readRuntimeConfig } from '@/config/runtime-config';

export default async function HomePage() {
  // Render per request so configuration comes from the runtime environment, not the build.
  await connection();

  const runtime = readRuntimeConfig();
  if (!runtime.ok) {
    console.error(`[config] ${runtime.error}`);
    return <FatalScreen configError />;
  }
  return <MiniApp config={runtime.config} />;
}
