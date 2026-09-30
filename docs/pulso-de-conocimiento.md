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

## Envío automático (paso único del equipo de tecnología)

Los admins no configuran nada técnico. El Pulso tiene una ejecución diaria,
`pulsoAvisoDiario` (carpeta `functions/`), que Firebase corre **una vez al día,
exactamente a la "Hora de envío"** configurada en Gestión del Pulso → Slack. En
esa ejecución la app (`/api/pulse/cron`) crea el pulso si falta, manda el aviso
de Slack y hace la limpieza de días anteriores (cierra pulsos pasados y vence
intentos a medias).

Cuando un admin cambia la hora de envío, la función `pulsoSincronizarHorario`
mueve esa ejecución diaria a la hora nueva. Si un deploy la regresa a su hora
inicial (8:00), se corrige sola en la siguiente ejecución o cuando un admin
abre Gestión del Pulso.

La hora de cierre no necesita ejecución propia: la pantalla del vendedor ya
no deja empezar después de esa hora.

Solo hay que desplegarla **una vez** (y de nuevo si cambia `functions/`):

```
firebase deploy --only functions:pulso
```

El deploy instala solo las dependencias de `functions/` (paso `predeploy` en
`firebase.json`). Usa `--only functions:pulso` para no publicar al mismo
tiempo el hosting ni las reglas de Firestore/Storage del repositorio.

No requiere otra configuración:

- El secreto que protege `/api/pulse/cron` lo genera la función en su primera
  ejecución y lo guarda en `org_tokens` (`pulse_cron_secret`).
- La URL de la app se registra sola la primera vez que un admin abre
  **Gestión del Pulso**. Como respaldo se puede poner `APP_URL=https://…`
  en `functions/.env`.
- Mover la hora requiere que la cuenta de servicio de las funciones pueda
  editar Cloud Scheduler. Por defecto la tiene (rol Editor); si el panel dice
  que falta permiso, dale el rol «Cloud Scheduler Admin».
- Requiere el plan Blaze de Firebase.

El panel muestra en lenguaje simple el estado: "todos los días a las 8:00 AM",
"cambiando la hora…", "no está encendido", "detenido" o "con problemas".
Mientras no funcione, el aviso se puede mandar con el botón "Enviar aviso de
Slack ahora".

## Dónde se configura cada cosa

| Qué | Dónde |
| --- | --- |
| Preguntas por pulso, hora de cierre, módulos, aleatoriedad, pulso automático | Gestión del Pulso → Ajustes |
| Todo lo de Slack: mensaje, hora de envío, Slack ID de cada usuario, canales, personas extra y prueba | Gestión del Pulso → Slack |
| Token del bot de Slack | Admin → Tokens |

La plantilla del mensaje admite `{date}`, `{preguntas}` y `{cierre}`.
