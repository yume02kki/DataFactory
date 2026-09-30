import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** The commit being built, baked into the app (shown by the channel pill on /dev). */
function commitInfo() {
  try {
    const [sha, time, message] = execFileSync('git', ['log', '-1', '--format=%H%x1f%cI%x1f%s'], { encoding: 'utf8' })
      .trim()
      .split('\x1f');
    return { sha, time, message };
  } catch {
    return { sha: '', time: '', message: '' };
  }
}

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    // VITE_CHANNEL is set by the deploy server ("main" or "dev"); empty when building locally.
    __BUILD_INFO__: JSON.stringify({ channel: process.env.VITE_CHANNEL ?? '', ...commitInfo() }),
  },
});
