/**
 * POST /api/pulse/send-slack
 * Envía el mensaje del Pulso de Conocimiento a los canales de Slack configurados
 * y como DM a todos los usuarios que tienen slackId configurado en su perfil.
 *
 * Variable de entorno requerida:
 *   SLACK_BOT_TOKEN  — Token del bot de Slack (xoxb-...)
 *
 * La URL de la app se configura en /admin/knowledge-pulse → Config Slack → "URL de la app".
 *
 * Body: { date: "YYYY-MM-DD", test?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSlackConfig, getOrgToken, getAllUsers } from '@/lib/firestore-service';

async function sendSlackMessage(
  token: string,
  channel: string,
  text: string,
  blocks: unknown[]
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text, blocks, unfurl_links: false }),
  });
  return res.json() as Promise<{ ok: boolean; error?: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const { date, test = false } = await req.json() as { date: string; test?: boolean };

    // Leer token desde Firestore primero; si no existe, usar variable de entorno como respaldo
    const storedToken = await getOrgToken('slack_bot_token');
    const token = storedToken?.value || process.env.SLACK_BOT_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'SLACK_BOT_TOKEN no configurado. Agrégalo en Admin → Sistema → Tokens o como variable de entorno.' },
        { status: 500 }
      );
    }

    const cfg = await getSlackConfig();
    if (!cfg) {
      return NextResponse.json({ error: 'Configuración de Slack no encontrada. Guarda la config en Admin → Knowledge Pulse → Slack.' }, { status: 404 });
    }
    if (!cfg.active && !test) {
      return NextResponse.json({ error: 'Notificaciones de Slack desactivadas' }, { status: 400 });
    }

    // Build message text and blocks
    const pulseLink = cfg.appUrl ? `${cfg.appUrl.replace(/\/$/, '')}/pulse` : '';

    const [y, m, d] = date.split('-').map(Number);
    const displayDate = new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    const textBody = (cfg.messageTemplate || '¡Es hora del Pulso de Conocimiento diario! 📚')
      .replace('{date}', displayDate)
      .replace(/\{link\}/g, '')
      .trim();

    const testPrefix = test ? '🧪 *[PRUEBA]* ' : '';
    const finalText = testPrefix + textBody;
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

    const results: { target: string; type: 'channel' | 'dm'; ok: boolean; error?: string }[] = [];

    // 1. Send to active channels (if any)
    const activeChannels = cfg.channels?.filter(ch => ch.active) ?? [];
    for (const ch of activeChannels) {
      const data = await sendSlackMessage(token, ch.channelId, fallbackText, blocks);
      results.push({ target: ch.channelName, type: 'channel', ok: data.ok, error: data.error });
    }

    // 2. Send DMs to all users with slackId configured in their profile
    const allUsers = await getAllUsers();
    const usersWithSlack = allUsers.filter(u => u.slackId?.trim());
    const sentSlackIds = new Set<string>();
    for (const user of usersWithSlack) {
      const slackId = user.slackId!.trim();
      sentSlackIds.add(slackId);
      const data = await sendSlackMessage(token, slackId, fallbackText, blocks);
      results.push({ target: user.nombre || user.email, type: 'dm', ok: data.ok, error: data.error });
    }

    // 3. Send DMs to directRecipients configured in the Slack config (de-duped)
    const directRecipients = cfg.directRecipients ?? [];
    for (const recipient of directRecipients) {
      const slackId = recipient.slackUserId?.trim();
      if (!slackId || sentSlackIds.has(slackId)) continue; // skip if already sent via user profile
      const data = await sendSlackMessage(token, slackId, fallbackText, blocks);
      results.push({ target: recipient.displayName, type: 'dm', ok: data.ok, error: data.error });
    }

    // If nothing was configured to send, return an informative error
    if (results.length === 0) {
      return NextResponse.json({
        error: 'Nada que enviar: no hay canales activos ni usuarios con Slack ID configurado.',
      }, { status: 400 });
    }

    const failed = results.filter(r => !r.ok);
    const succeeded = results.filter(r => r.ok);

    if (failed.length === results.length) {
      return NextResponse.json({ message: 'Todos los envíos fallaron', results }, { status: 502 });
    }
    if (failed.length > 0) {
      return NextResponse.json({
        message: `${succeeded.length} enviados, ${failed.length} fallaron`,
        results,
        partialSuccess: true,
      }, { status: 207 });
    }

    return NextResponse.json({
      message: `${results.length} mensaje${results.length !== 1 ? 's' : ''} enviado${results.length !== 1 ? 's' : ''}`,
      results,
    });
  } catch (err: unknown) {
    console.error('[send-slack] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

