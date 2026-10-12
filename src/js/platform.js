// File dialogs and email, through Tauri when running as the desktop app and
// through plain browser downloads otherwise (useful while developing).

const tauri = window.__TAURI__;
export const isDesktop = Boolean(tauri);

const baseName = (p) => String(p).split(/[\\/]/).pop();

// Returns { name, bytes } or null if the user cancelled.
export async function pickFile(extensions) {
  if (isDesktop) {
    const path = await tauri.dialog.open({ multiple: false, filters: [{ name: extensions.join(', '), extensions }] });
    if (!path) return null;
    return { name: baseName(path), bytes: await tauri.fs.readFile(path) };
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: extensions.map((e) => '.' + e).join(',') });
    input.onchange = async () => {
      const f = input.files[0];
      resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    input.click();
  });
}

// Saves bytes (Uint8Array) through a save dialog. Returns the saved name or null.
export async function saveFile(defaultName, bytes, extensions) {
  if (isDesktop) {
    const path = await tauri.dialog.save({ defaultPath: defaultName, filters: [{ name: extensions.join(', '), extensions }] });
    if (!path) return null;
    await tauri.fs.writeFile(path, bytes);
    return baseName(path);
  }
  const url = URL.createObjectURL(new Blob([bytes]));
  Object.assign(document.createElement('a'), { href: url, download: defaultName }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return defaultName;
}

// Opens a new message in the user's mail program with the file attached.
// Returns 'attached' when the mail program took the attachment, or the file
// name the user has to attach by hand after the fallback.
export async function emailFile({ subject, body, fileName, bytes }) {
  if (isDesktop) {
    try {
      await tauri.core.invoke('send_mail', { subject, body, fileName, bytes: Array.from(bytes) });
      return 'attached';
    } catch {
      // No MAPI mail program (for example the new Outlook): save to Downloads
      // and open a plain mailto: message instead.
      const dir = await tauri.path.downloadDir();
      const path = await tauri.path.join(dir, fileName);
      await tauri.fs.writeFile(path, bytes);
      await tauri.opener.openUrl(mailto(subject, body));
      await tauri.opener.revealItemInDir(path).catch(() => {});
      return fileName;
    }
  }
  await saveFile(fileName, bytes, [fileName.split('.').pop()]);
  location.href = mailto(subject, body);
  return fileName;
}

const mailto = (subject, body) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export async function openLink(url) {
  if (isDesktop) return tauri.opener.openUrl(url);
  window.open(url, '_blank', 'noopener');
}

export async function appVersion() {
  return isDesktop ? tauri.app.getVersion() : '1.1.1';
}
