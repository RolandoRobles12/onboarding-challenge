/**
 * POST /api/pulse/send-slack
 * Envía el mensaje del Pulso de Conocimiento a los canales de Slack configurados.
 *
 * Variable de entorno requerida:
 *   SLACK_BOT_TOKEN  — Token del bot de Slack (xoxb-...)
 *
 * La URL de la app se configura en /admin/knowledge-pulse → Config Slack → "URL de la app".
 *
 * Body: { date: "YYYY-MM-DD", test?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSlackConfig, getOrgToken } from '@/lib/firestore-service';

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
      return NextResponse.json({ error: 'Configuración de Slack no encontrada' }, { status: 404 });
    }
    if (!cfg.active && !test) {
      return NextResponse.json({ error: 'Notificaciones de Slack desactivadas' }, { status: 400 });
    }

    const activeChannels = cfg.channels.filter(ch => ch.active);
    if (activeChannels.length === 0) {
      return NextResponse.json({ error: 'No hay canales activos configurados' }, { status: 400 });
    }

    // La URL de la app se lee del config de Slack (configurada por el admin, sin env var adicional)
    const pulseLink = `${cfg.appUrl.replace(/\/$/, '')}/pulse`;

    // Format display date
    const [y, m, d] = date.split('-').map(Number);
    const displayDate = new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    // Build the text body — {link} is now rendered as a Block Kit button, not inline text
    const textBody = cfg.messageTemplate
      .replace('{date}', displayDate)
      .replace(/\{link\}/g, '')
      .trim();

    const testPrefix = test ? '🧪 *[PRUEBA]* ' : '';
    const finalText = testPrefix + textBody;

    // Slack Block Kit: section with message text + primary button for the link
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: finalText,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📚 Responder el Pulso →',
              emoji: true,
            },
            style: 'primary',
            url: pulseLink,
          },
        ],
      },
    ];

    const results: { channel: string; ok: boolean; error?: string }[] = [];

    for (const ch of activeChannels) {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: ch.channelId,
          text: `${finalText} ${pulseLink}`, // fallback text for notifications/accessibility
          blocks,
          unfurl_links: false,
        }),
      });

      const data = await res.json() as { ok: boolean; error?: string };
      results.push({ channel: ch.channelName, ok: data.ok, error: data.error });
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
      return NextResponse.json({
        message: 'Algunos mensajes fallaron',
        results,
        partialSuccess: results.some(r => r.ok),
      }, { status: 207 });
    }

    return NextResponse.json({ message: 'Mensajes enviados', results });
  } catch (err: unknown) {
    console.error('[send-slack] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
