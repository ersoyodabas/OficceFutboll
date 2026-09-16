import { spawn } from 'node:child_process';

// Opens the URL in the OS default browser. Failures only log a hint, so a
// headless machine still runs the server.
export function openBrowser(url) {
  const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log(`Tarayici acilamadi, elle ac: ${url}`));
    child.unref();
  } catch {
    console.log(`Tarayici acilamadi, elle ac: ${url}`);
  }
}
