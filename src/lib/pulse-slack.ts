/**
 * Envío del aviso del Pulso de Conocimiento por Slack (solo servidor).
 * Lo usan /api/pulse/send-slack (envío manual o de prueba desde el admin) y
 * /api/pulse/cron (envío automático a la hora configurada).
 */

import { getSlackConfig, getOrgToken, getAllUsers, getPulseConfig } from './firestore-service';
import { applySlackTemplate, formatHHMM, formatPulseDate } from './pulse-utils';

export interface SlackSendResult {
  target: string;
  type: 'channel' | 'dm';
  ok: boolean;
  error?: string;
}

export class PulseSlackError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function postMessage(token: string, channel: string, text: string, blocks: unknown[]) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text, blocks, unfurl_links: false }),
  });
  return res.json() as Promise<{ ok: boolean; error?: string }>;
}

/**
 * Envía el aviso del pulso del día.
 *
 * - Envío real: canales activos + DM a los vendedores con Slack ID (si
 *   `dmSellers` no está desactivado) + destinatarios directos extra.
 * - Prueba (`test`): solo a `testSlackId` (el admin que la pide) o, si no
 *   tiene Slack ID, a los destinatarios directos. Nunca a vendedores ni canales.
 */
export async function sendPulseSlack(opts: {
  date: string;
  test?: boolean;
  testSlackId?: string;
  /** URL base a usar si no hay `appUrl` guardada (ej. el host de la petición). */
  fallbackBaseUrl?: string;
}): Promise<SlackSendResult[]> {
  const storedToken = await getOrgToken('slack_bot_token');
  const token = storedToken?.value || process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new PulseSlackError('SLACK_BOT_TOKEN no configurado. Agrégalo en Admin → Sistema → Tokens o como variable de entorno.', 500);
  }

  const [cfg, pulseCfg] = await Promise.all([getSlackConfig(), getPulseConfig()]);
  if (!cfg) {
    throw new PulseSlackError('Configuración de Slack no encontrada. Guárdala en Admin → Pulso → Slack.', 404);
  }
  if (!cfg.active && !opts.test) {
    throw new PulseSlackError('Notificaciones de Slack desactivadas', 400);
  }

  const baseUrl = cfg.appUrl?.trim() ? cfg.appUrl.trim().replace(/\/$/, '') : (opts.fallbackBaseUrl ?? '');
  const pulseLink = baseUrl ? `${baseUrl}/pulse` : '';

  const textBody = applySlackTemplate(cfg.messageTemplate, {
    date: formatPulseDate(opts.date),
    preguntas: pulseCfg.questionsPerPulse,
    cierre: formatHHMM(pulseCfg.closeAt),
  });
  const finalText = (opts.test ? '🧪 *[PRUEBA]* ' : '') + textBody;
  const fallbackText = pulseLink ? `${finalText} ${pulseLink}` : finalText;
  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text: finalText } },
    ...(pulseLink ? [{
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '📚 Responder el Pulso →', emoji: true },
        style: 'primary',
        url: pulseLink,
      }],
    }] : []),
  ];

  const targets: { id: string; name: string; type: 'channel' | 'dm' }[] = [];
  const seen = new Set<string>();
  const addTarget = (id: string | undefined, name: string, type: 'channel' | 'dm') => {
    const clean = id?.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    targets.push({ id: clean, name, type });
  };

  if (opts.test) {
    if (opts.testSlackId?.trim()) {
      addTarget(opts.testSlackId, 'Tú', 'dm');
    } else {
      for (const r of cfg.directRecipients ?? []) addTarget(r.slackUserId, r.displayName, 'dm');
    }
    if (targets.length === 0) {
      throw new PulseSlackError('Para enviar una prueba agrega tu Slack ID en Admin → Configuración Slack → Usuarios, o un destinatario directo.', 400);
    }
  } else {
    for (const ch of cfg.channels ?? []) {
      if (ch.active) addTarget(ch.channelId, ch.channelName, 'channel');
    }
    if (cfg.dmSellers !== false) {
      const users = await getAllUsers();
      for (const u of users) {
        if (u.rol !== 'seller' || u.active === false) continue;
        addTarget(u.slackId, u.nombre || u.email, 'dm');
      }
    }
    for (const r of cfg.directRecipients ?? []) addTarget(r.slackUserId, r.displayName, 'dm');
    if (targets.length === 0) {
      throw new PulseSlackError('Nada que enviar: no hay canales activos ni vendedores con Slack ID configurado.', 400);
    }
  }

  const results: SlackSendResult[] = [];
  for (const t of targets) {
    try {
      const data = await postMessage(token, t.id, fallbackText, blocks);
      results.push({ target: t.name, type: t.type, ok: data.ok, error: data.error });
    } catch (err) {
      results.push({ target: t.name, type: t.type, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** Resume los resultados para guardarlos en el pulso. */
export function summarizeSlackResults(results: SlackSendResult[]): { ok: number; failed: number; error?: string } {
  const failed = results.filter(r => !r.ok);
  return {
    ok: results.length - failed.length,
    failed: failed.length,
    error: failed.length > 0
      ? failed.slice(0, 3).map(r => `${r.target}: ${r.error ?? 'error'}`).join(' · ')
      : undefined,
  };
}
