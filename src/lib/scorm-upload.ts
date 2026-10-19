/**
 * Sube un paquete SCORM (.zip) desde el panel: lo descomprime en el navegador,
 * sube cada archivo a Storage y devuelve la URL de inicio (servida por
 * /scorm/...) y la versión que declara su imsmanifest.xml.
 */

import JSZip from 'jszip';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

const CONCURRENCY = 6;

function contentType(name: string): string | undefined {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: 'text/html', htm: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json',
    xml: 'application/xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', mp4: 'video/mp4', mp3: 'audio/mpeg', woff: 'font/woff', woff2: 'font/woff2',
  };
  return ext ? map[ext] : undefined;
}

export async function uploadScormPackage(
  file: File,
  courseId: string,
  onProgress: (pct: number) => void,
): Promise<{ launchUrl: string; version: '1.2' | '2004' }> {
  if (!storage) throw new Error('Storage no está configurado.');
  const zip = await JSZip.loadAsync(file);
  const manifestPath = Object.keys(zip.files)
    .filter(p => p.toLowerCase().endsWith('imsmanifest.xml'))
    .sort((a, b) => a.length - b.length)[0];
  if (!manifestPath) throw new Error('El .zip no tiene imsmanifest.xml: no parece un paquete SCORM.');
  const root = manifestPath.slice(0, manifestPath.length - 'imsmanifest.xml'.length);

  const manifest = new DOMParser().parseFromString(await zip.file(manifestPath)!.async('text'), 'application/xml');
  const byTag = (el: Document | Element, tag: string) => Array.from(el.getElementsByTagName('*')).filter(n => n.localName === tag);
  const schemaVersion = byTag(manifest, 'schemaversion')[0]?.textContent ?? '';
  const version: '1.2' | '2004' = /2004|CAM 1\.3/i.test(schemaVersion) ? '2004' : '1.2';

  const organization = byTag(manifest, 'organization')[0];
  const firstItem = organization ? byTag(organization, 'item').find(i => i.getAttribute('identifierref')) : undefined;
  const resources = byTag(manifest, 'resource');
  const resource = resources.find(r => r.getAttribute('identifier') === firstItem?.getAttribute('identifierref'))
    ?? resources.find(r => r.getAttribute('href'));
  const href = resource?.getAttribute('href');
  if (!href) throw new Error('El imsmanifest.xml no indica la página de inicio del curso.');
  const base = resource?.getAttribute('xml:base') ?? '';

  const packageId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const folder = `courses/${courseId || 'draft'}/scorm/${packageId}`;
  const entries = Object.values(zip.files).filter(f => !f.dir && f.name.startsWith(root));
  let done = 0;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    await Promise.all(entries.slice(i, i + CONCURRENCY).map(async entry => {
      const data = await entry.async('uint8array');
      const relative = entry.name.slice(root.length);
      await uploadBytes(ref(storage!, `${folder}/${relative}`), data, { contentType: contentType(relative) });
      done++;
      onProgress(Math.round((done / entries.length) * 100));
    }));
  }
  const launch = `${base}${href}`.replace(/^\.?\//, '');
  return { launchUrl: `/scorm/${folder}/${launch.split('/').map(encodeURIComponent).join('/')}`.replace(/%3F/g, '?').replace(/%3D/g, '=').replace(/%26/g, '&'), version };
}
