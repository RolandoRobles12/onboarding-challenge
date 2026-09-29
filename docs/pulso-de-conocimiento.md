# Pulso de Conocimiento

Cuestionario diario para el equipo comercial. Esta guía resume cómo funciona y
qué hay que configurar para que corra solo.

## Ciclo de un día

Todas las fechas y horas se calculan en la zona del equipo
(`America/Mexico_City`, ver `src/lib/pulse-utils.ts`), no en la del
dispositivo ni en la del servidor.

1. **Creación.** Con "Pulso automático diario" activo, el proceso programado
   crea el pulso del día. La página del vendedor también lo crea como
   respaldo. El pool reparte las preguntas entre módulos, prioriza las de
   menos aciertos y deja al final las usadas en los últimos 10 días.
2. **Asignación.** Cada vendedor recibe `questionsPerPulse` preguntas:
   - con "mismas preguntas para todos", las primeras N del pool;
   - si no, N al azar.

   Se guardan en su intento, así que editar el pool después no afecta a quien
   ya empezó.
3. **Respuestas.** Cada respuesta se guarda al confirmarla y antes de mostrar
   la solución. No se puede cambiar ni reiniciar el pulso; si el vendedor
   sale, continúa donde se quedó.
4. **Aviso de Slack.** Sale a la "Hora de envío" una sola vez, a canales
   activos, a vendedores activos con Slack ID y a destinatarios extra. El
   resultado (entregados y fallidos) queda visible en el panel.
5. **Cierre.** A la "Hora de cierre" ya no se puede iniciar. Quien empezó
   antes puede terminar ese día. Los intentos que quedan a medias se marcan
   como vencidos al día siguiente.
6. **Repaso.** Las preguntas falladas van al "Repaso pendiente" del vendedor.
   Solo salen de ahí cuando se responden bien; tras un error, el siguiente
   intento queda para el día siguiente.

## Proceso programado (obligatorio para el envío y cierre automáticos)

`GET /api/pulse/cron` hace, de forma idempotente, todo lo que toque según la
hora: crear, enviar, cerrar y vencer. Hay que llamarlo cada 5–15 minutos, por
ejemplo con Cloud Scheduler:

```
gcloud scheduler jobs create http pulso-cron \
  --schedule="*/10 * * * *" \
  --uri="https://<tu-dominio>/api/pulse/cron" \
  --http-method=GET \
  --headers="Authorization=Bearer <secreto>"
```

El secreto se define en **Admin → Tokens** con la clave `pulse_cron_secret`,
o en la variable de entorno `PULSE_CRON_SECRET`. Sin secreto configurado el
endpoint responde 503.

La última ejecución y sus acciones se ven en **Gestión del Pulso → Ajustes →
Automatización**. Si deja de correr, el panel muestra una alerta.

## Dónde se configura cada cosa

| Qué | Dónde |
| --- | --- |
| Preguntas por pulso, hora de cierre, módulos, aleatoriedad, pulso automático | Gestión del Pulso → Ajustes |
| Mensaje, hora de envío, DM a vendedores, prueba | Gestión del Pulso → Slack |
| Slack IDs de usuarios, canales, destinatarios extra | Configuración Slack |
| Token del bot de Slack y secreto del cron | Admin → Tokens |

La plantilla del mensaje admite `{date}`, `{preguntas}` y `{cierre}`.
