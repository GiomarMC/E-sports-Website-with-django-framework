# Avisos automáticos (webhooks)

El sitio avisa a otros servicios (por ejemplo, un bot de Discord) cuando pasa
algo público en un torneo. No hace falta consultar la API cada cierto tiempo:
el sitio envía un `POST` con los datos del evento a cada dirección registrada,
solo cuando ocurre.

Las direcciones se administran en **Admin → Configuración → Avisos
automáticos** (solo superadmins). Para conectar otro bot basta con agregar su
dirección; no hay que tocar el código. Cada dirección puede elegir qué eventos
recibe, pausarse o probarse con el botón **Probar**.

## El bot de Discord del evento

El repo trae un bot listo en `bot/` (solo librería estándar de Python). Corre
como el contenedor `bot` en el mismo servidor: el sitio le avisa por la red
interna (`http://bot:8080/events`, sin puerto público) y él publica en
Discord con el token del bot. Las plantillas están en `bot/templates.py` y el
canal de cada juego y evento en `bot/channels.json` (sin emoji:
`avisos-l4d` = `📢・avisos-l4d`).

Para activarlo (una sola vez):

1. En **Admin → Configuración → Avisos automáticos** agrega la dirección
   `http://bot:8080/events` (nombre: "Bot de Discord") y copia su **clave**.
2. En el `.env` del servidor completa `DISCORD_TOKEN`, `DISCORD_GUILD_ID` y
   `BOT_WEBHOOK_SECRET` (la clave del paso 1) y reinicia el bot:
   `docker compose -f docker-compose.prod.yml --env-file .env up -d bot`.
3. Pulsa **Probar** en el panel: debe responder `HTTP 202`.

Los registros del bot: `docker compose -f docker-compose.prod.yml logs -f bot`.

## Eventos

| Evento | Cuándo se envía |
|---|---|
| `match.scheduled` | Se asigna o cambia la fecha de uno o varios matchs. La programación automática de una fase entera llega como **un solo** aviso con todos sus matchs. |
| `match.started` | Un admin marca el match como "En vivo". Incluye sus transmisiones, que se encienden con él. |
| `stream.live` | Una transmisión se activa a mano o se crea vinculada a un match que ya está en vivo. Si se enciende porque empezó su match, solo llega `match.started`. |
| `match.result` | El admin o árbitro registra el resultado oficial. Si corrige un resultado ya publicado, llega otra vez con `corrected: true`. |
| `ping` | Solo con el botón **Probar** del panel. |

## La petición

```
POST <tu dirección>
Content-Type: application/json
User-Agent: Esports-Webhooks/1.0
X-Esports-Event: match.result
X-Esports-Timestamp: 1793116800
X-Esports-Signature: sha256=<hex>
```

```json
{
  "id": "b4c1…",
  "event": "match.result",
  "created_at": "2026-10-29T02:05:00+00:00",
  "data": { … }
}
```

`id` es único por aviso: si llega dos veces el mismo `id` (por un reintento),
ignora el segundo.

### `data` de un match

`match.started` envía este objeto; `match.scheduled` envía
`{"matches": [ … ]}` con uno por match (más `rescheduled: true` si ya tenía
fecha); `match.result` le agrega `winner`, `losers`, `draw` y `corrected`.

```json
{
  "id": 42,
  "label": "Semifinal 1",
  "stage": "Playoffs",
  "group": null,
  "round": 1,
  "bracket": null,
  "best_of": 3,
  "status": "completed",
  "scheduled_at": "2026-10-29T01:00:00+00:00",
  "tournament": {"id": 1, "name": "Copa Left4dead SemCom 2026"},
  "game": {"id": 3, "name": "Left 4 Dead 2", "url": "https://esports.subepe.app/juegos/3"},
  "teams": [
    {"id": 7, "name": "Los niños", "logo": "https://esports.subepe.app/media/logos/a.png", "score": 2, "placement": null},
    {"id": 9, "name": "chinitos", "logo": null, "score": 1, "placement": null}
  ],
  "streams": [
    {"id": 5, "title": "Left · Semifinal 1", "platform": "twitch", "url": "https://twitch.tv/…", "is_live": true}
  ],
  "schedule_url": "https://esports.subepe.app/cronograma",
  "winner": {"id": 7, "name": "Los niños", "logo": "…", "score": 2, "placement": null},
  "losers": [{"id": 9, "name": "chinitos", "logo": null, "score": 1, "placement": null}],
  "draw": false,
  "corrected": false
}
```

- Las fechas van en ISO 8601 y en UTC (`+00:00`); conviértelas a la hora de Perú al mostrarlas.
- `score` y `placement` solo aparecen cuando el match terminó.
- Un equipo aún por definir (llave) llega con `id` y `name` en `null`.
- `stream.live` envía `{"stream": {…}, "game": {…}, "match": {…} | null}`.

Solo viajan datos públicos: nombres de equipos, logos, horarios,
transmisiones y resultados. Nunca códigos de estudiante, celulares, correos,
comprobantes ni notas internas. Los enlaces usan el dominio del sitio
(`SITE_URL`, o `https://DOMAIN` en producción), nunca la IP del servidor.

> El receptor sí ve, como en cualquier conexión, la IP desde la que llega la
> petición. Si eso importa, la dirección del bot no debe ser pública.

## Verificar la firma

Cada dirección tiene una **clave** (se ve y copia en el panel). La firma es un
HMAC-SHA256 de `"<timestamp>.<cuerpo crudo>"` con esa clave. Rechaza el aviso
si la firma no coincide o si el timestamp tiene más de 5 minutos.

```python
import hashlib, hmac, time

def is_valid(secret: str, headers, raw_body: bytes) -> bool:
    timestamp = headers['X-Esports-Timestamp']
    if abs(time.time() - int(timestamp)) > 300:
        return False
    expected = hmac.new(
        secret.encode(), f'{timestamp}.'.encode() + raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(headers['X-Esports-Signature'], f'sha256={expected}')
```

```js
import crypto from 'node:crypto'

function isValid(secret, headers, rawBody) {
  const timestamp = headers['x-esports-timestamp']
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')
  const given = Buffer.from(headers['x-esports-signature'] ?? '')
  const wanted = Buffer.from(`sha256=${expected}`)
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted)
}
```

Usa el cuerpo **crudo** (tal como llegó), no el JSON ya interpretado.

## Respuesta y reintentos

- Responde cualquier `2xx` rápido (en menos de 5 segundos) y procesa después.
- Si no responde o devuelve `5xx` / `429`, se reintenta 2 veces (a los 3 y 15
  segundos). Otros `4xx` no se reintentan (por ejemplo, firma rechazada).
- El panel muestra el resultado del último aviso de cada dirección.
- La dirección debe ser `https://`.
