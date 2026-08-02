---
name: "community-engagement-playbook"
description: "When the user wants to gestionar comunidad diaria, responder comentarios/DMs con criterio, definir SLAs por canal, o entrenar a un CM junior. Use for community management routines, response frameworks, escalation matrices, engagement KPIs. NOT for paid ads, influencer outreach, crisis handling. Related: crisis-communication, ugc-user-generated-content, social-content."
license: MIT
metadata:
  version: 1.0.0
  author: Community Manager Platform
  category: community
  updated: 2026-08-01
---

# Community Engagement Playbook

Sistema operacional para gestionar la conversacion diaria de una marca en redes sociales. Cubre rutinas, framework de respuesta, tipologia de comentarios, SLAs por canal, escalation y metricas.

## 1. Rutina diaria del CM (bloques fijos)

### Bloque manana (07:30 - 07:45 hora local del mercado principal)
Objetivo: capturar todo lo que paso durante la noche y evitar que un incidente escale antes de que abras.

Checklist (marcar 1 por 1, no batch):
1. Inbox unificado (Metricol/Sprout/Hootsuite) filtrado por `sentiment: negative` → responder o escalar en <10 min.
2. Menciones sin @ (social listening: Brand24, Mention, Meltwater) filtro `mentions >5 en 1h` → detectar viralizacion.
3. Comments en las ultimas 3 publicaciones organicas → prioridad questions > complaints > praise.
4. DMs con status `unread >12h` → responder aunque sea holding message ("Ya te leimos, dame 30 min").
5. Google Alerts + Reddit search de marca → capturar conversaciones fuera de RRSS oficiales.

Regla: si en manana encuentras >3 quejas del mismo tema → activar `crisis-communication` skill nivel 1.

### Bloque tarde (14:00 - 14:30)
1. Cerrar tickets pendientes del morning batch.
2. Responder comments de las publicaciones posteadas ese dia (peak engagement TikTok/IG suele ser 12-14h).
3. Curar 3 piezas de UGC para reshare (ver `ugc-user-generated-content`).
4. Revisar sentiment del dia en dashboard → si score <60/100 dispara alerta al brand manager.
5. Preparar 2 posts conversacion-starter para manana (preguntas, polls, "esto o esto").

### Bloque final (17:30 - 17:45)
1. Cerrar loop de todo lo pendiente antes de fin de jornada.
2. Programar respuestas automaticas fuera-de-hora en Meta Business ("Volvemos manana a las 8am, urgencias: soporte@").
3. Log del dia en Notion/Airtable: tickets abiertos, sentiment, cualquier tema recurrente.

## 2. Framework HEART para respuestas

Cada respuesta a un comment/DM sensible debe pasar por los 5 pasos. Tiempo de redaccion: 60-90 seg por respuesta compleja.

- **H (Hear)**: repetir el problema en tus palabras. Demuestra que leiste, no que copiaste template. Ej: "Entiendo, el pedido llego con la caja rota y perdiste el regalo de cumpleanos de tu sobrina."
- **E (Empathize)**: nombrar la emocion sin invalidarla. NUNCA "entiendo tu frustracion, pero..." — el "pero" cancela todo. Usar "entiendo que esto te frusto, y tienes razon."
- **A (Answer)**: dar UNA accion concreta con timeframe. Malo: "revisaremos tu caso". Bueno: "Te enviamos el reemplazo hoy por Servientrega, llega manana 15h, guia MC12345."
- **R (Recommend)**: opcional. Sugerir siguiente paso util (no venta). "Guarda la caja original 48h por si el courier la revisa."
- **T (Thank)**: cerrar con gratitud especifica, no "gracias por escribirnos". Ej: "Gracias por tomarte el tiempo de contarnos con foto, nos ayuda a mejorar el empaque."

**Regla anti-slop**: si un template tiene "en X, valoramos mucho tu opinion" o "tu feedback es importante para nosotros" → borrar y reescribir. Suena a bot.

## 3. Tipologia de comentarios y como responder

### 3.1 Praise (elogio, agradecimiento)
- SLA: <2h en horario laboral.
- Formato: respuesta corta (1-2 frases), specific compliment back, invitacion a compartir mas.
- Ejemplo ES: "Ese look te quedo INCREIBLE, Camila. Que color de labial usaste? Nos morimos por saber."
- Ejemplo EN: "That look is FIRE, Camila. What lip color are you rocking? Need to know."
- NO caer en: "Gracias por tu apoyo!" con emoji rojo → se percibe robotico.

### 3.2 Complaint (queja)
- SLA: <30 min si es publico, <15 min si es DM.
- Pasos: HEART framework completo + DM privado con solucion (nunca resolver plata/reembolsos en publico).
- Comentario publico: "Camila, gracias por avisarnos. Te escribi por DM para resolverlo hoy mismo."
- DM: solucion completa con caso ID.
- Trackear: crear ticket en Zendesk/Freshdesk, cerrar en <48h.

### 3.3 Question (pregunta de producto, envio, precio)
- SLA: <4h IG/FB, <2h TikTok, <30min WhatsApp.
- Formato: respuesta directa + link a recurso (FAQ, catalogo, calc de envio).
- Ejemplo: "Talla M mide 96cm de busto, 76 de cintura, 100 cadera. Guia completa aca [link]. Si dudas entre M y L, elegi L, corre pequeno."
- NO responder "escribinos por DM" a preguntas simples publicas → mata engagement y otros usuarios con la misma duda no ven la respuesta.

### 3.4 Spam / bots / links sospechosos
- Accion: eliminar + reportar + bloquear en 1 tap. No responder.
- Excepcion: bot que menciona competidor de forma engaging (raro pero pasa) → screenshot para el equipo, no interactuar.

### 3.5 Troll (agresion sin queja legitima)
- Regla de 3: si un troll postea 3+ comments provocativos en 24h → bloquear + esconder comments (no eliminar, hide, asi ellos no notan).
- Si es 1 comment: responder UNA vez con humor bajo (estilo Wendy's) o ignorar. Nunca engagement multiple.
- Ejemplo respuesta: usuario dice "producto de mierda". Marca responde: "Sentimos que no te haya gustado. Si tenes un caso concreto (num de orden) lo revisamos. Si es opinion general, respetamos." Punto final.

### 3.6 Off-topic / random
- Si es divertido y encaja con la voz de marca: responder con humor breve (max 1 emoji).
- Si es random-random: like + no responder. Guardar el reach.

## 4. SLA por canal (compromisos publicos internos)

| Canal | Response time p50 | Response time p95 | Horario cobertura |
|-------|-------------------|-------------------|-------------------|
| Instagram DM | 1h | 4h | 8:00-19:00 L-V, 10-15 S-D |
| Instagram comment | 2h | 6h | Igual |
| TikTok comment | 30min-1h | 2h | 10:00-22:00 (peak engagement noche) |
| TikTok DM | 2h | 6h | Igual |
| Facebook DM | 1h | 4h | 8:00-19:00 |
| WhatsApp Business | 15min | 30min | 8:00-20:00 |
| LinkedIn | 6h | 24h | L-V unicamente |
| X/Twitter | 30min | 2h | 8:00-22:00 |
| YouTube comment | 8h | 24h | Batch diario 15h |

**Regla**: si vas a tardar mas que el SLA p95 → post holding message ("Vimos tu mensaje, respondemos antes de las 19h").

## 5. Escalation matrix

Cuando un CM debe elevar sin dudar (5 min max de decision):

| Situacion | Escalar a | Canal urgencia |
|-----------|-----------|----------------|
| Reclamo con foto/video de producto defectuoso | Customer Success Lead | Slack #cx-alerts |
| Amenaza legal ("los voy a demandar", "SIC", "PROFECO") | Legal + Brand Manager | Llamada + email |
| Menciona medios de comunicacion o influencer >100k reach | Comms Lead + PR | Slack #pr-alerts |
| Denuncia de discriminacion, acoso, tema social sensible | Brand Manager + Legal | Reunion inmediata |
| Reclamo de empleado o ex-empleado publico | HR + Legal | Slack DM privado |
| Ataque coordinado (>10 comentarios similares en 1h) | Crisis Team → activar `crisis-communication` | War room |
| Data breach mencionado por usuario | Legal + CISO + CEO | Telefono directo |
| Producto vinculado a dano a persona (alergia, lesion) | CEO + Legal + Insurance | Escalar en 15min |

## 6. Metricas del CM (dashboard semanal)

### Metricas de servicio (tabla de mando)
- **Response Rate**: comments+DMs respondidos / total recibidos. Meta: >95%.
- **Avg First Response Time (FRT)** por canal. Meta: cumplir SLA p95 en 90% de casos.
- **Resolution Rate**: tickets cerrados <48h / total tickets. Meta: >85%.
- **Sentiment Score**: (positivos - negativos) / total mencionado. Meta: >+40.
- **Community NPS** (encuesta trimestral a followers activos): meta >30 (bueno), >50 (excelente).

### Metricas de crecimiento (relacion con contenido)
- **Engagement Rate por post** = (likes+comments+saves+shares) / reach. Benchmark 2026: IG 3-6%, TikTok 5-9%, LinkedIn 2-4%.
- **Comments-to-Likes Ratio**: >5% = alta conversacion. <1% = contenido plano.
- **Shares** por post (viralidad real): meta >2% del reach en TikTok/Reels.
- **Save Rate** en IG: >3% = contenido de valor. Save es la senal mas fuerte del algoritmo IG 2026.

### Metricas de comunidad (salud)
- **Repeat Commenters** (semanal): personas que comentan 3+ veces en 30d. Estos son tu core, cuidalos.
- **Advocacy Rate**: % de menciones sin @ que hablan positivo de la marca.
- **Share of Voice** vs top 3 competidores.

## 7. Templates de respuesta (15 escenarios)

### 7.1 Queja envio tardio (ES)
"Hola [nombre], entendemos que llevas [X dias] esperando y eso es frustrante — sobre todo si ya tenias planes con lo que pediste. Ya revisamos con [courier] y tu pedido [num] esta programado para llegar [fecha con hora]. Te escribimos por DM para compensarte los dias de retraso. Gracias por avisarnos con paciencia."

### 7.1b Late shipping complaint (EN)
"Hey [name], we hear you — [X days] waiting is way too long, especially when you had plans. We checked with [courier], your order [num] is out for delivery [date/time]. DM'd you to make it right for the delay. Thanks for being patient with us."

### 7.2 Pregunta de talla (ES)
"[nombre] talla M en este [producto] cubre busto 92-96cm, cintura 72-78, cadera 98-102. Si estas en el borde superior, sugerimos L. Guia completa con como medirte: [link]. Cualquier duda, DM y te asesoramos con tus medidas."

### 7.2b Sizing question (EN)
"Hey [name], size M fits bust 92-96cm / waist 72-78 / hip 98-102. If you're at the top of the range, go L. Full sizing guide + how-to-measure video: [link]. DM us your measurements if you want a personal call."

### 7.3 Elogio genuino (ES)
"[nombre] muchisimas gracias por compartir tu look, se ve espectacular. Podemos repostearlo en nuestro feed dandote credito? Nos encantaria."

### 7.3b Genuine praise (EN)
"[name] this look is unreal, thanks so much for sharing. Cool if we repost on our feed with credit? Would love to."

### 7.4 Producto agotado (ES)
"[nombre] el [producto] en talla M esta agotado ahora, pero entra restock la semana del [fecha]. Te avisamos primero? Dejanos tu email por DM y quedas en lista prioritaria."

### 7.5 Reembolso solicitado (ES, publico)
"[nombre] gracias por avisarnos, procesamos reembolsos hasta en 5 dias habiles. Te escribi por DM con los pasos para que quede listo hoy mismo."

### 7.6 Elogio + queja mixta (ES)
"[nombre] nos alegra que te encante el color, y tienes razon con el tema del boton — no deberia salirse en primera lavada. Te escribi por DM para reemplazo o reembolso, lo que prefieras. Gracias por el feedback honesto, nos sirve."

### 7.7 Pregunta sobre stock local (ES)
"[nombre] este modelo esta en la tienda de [ciudad, direccion]. Si preferis online, entra a [link]. Envio gratis desde $150k."

### 7.8 Comentario troll con humor bajo (ES, estilo Aldi UK)
Troll: "esta ropa es carisima"
Marca: "Se puede pagar en 3 cuotas sin intereses. Y si necesitas, tenemos outlet con -50%. Que talla?"

### 7.9 Pregunta sobre materiales / sostenibilidad (ES)
"[nombre] usamos algodon organico certificado GOTS + polyester reciclado (rPET) 40%. Ficha completa por producto en cada pagina. Reporte de sostenibilidad 2025: [link]."

### 7.10 Compliment a foto UGC (ES)
"[nombre] la luz de esta foto es una locura, quien te la tomo? El look tambien, obvio."

### 7.11 Consulta post-compra (funciono?)
"Hola [nombre], vimos que recibiste tu pedido hace [X dias]. Como te va con [producto]? Nos encantaria una foto usandola si te animas. #hashtagmarca"

### 7.12 DM primer contacto de lead (ES)
"Hola [nombre] gracias por escribirnos. Que buscas — te ayudamos con producto especifico, disponibilidad, o algo de la coleccion nueva?"

### 7.13 Cliente frecuente reconocido (ES)
"[nombre] ya sos parte de la familia, es la tercera vez que reposteas nuestros looks. Te mandamos un pequeno regalo en tu proxima compra, DM con tu talla favorita."

### 7.14 Comment que menciona competencia (ES)
Usuario: "prefiero X marca porque son mas baratos"
Marca: "Respetamos la eleccion. Cada quien elige lo que le encaje. Si algun dia queres probar la calidad de la nuestra, hay outlet de temporada con -40% en [link]."

### 7.15 Error del CM / marca (asumir publico)
"Ayer respondimos mal al comentario de [@usuario] y lo estamos corrigiendo. Fue error del equipo, no reflejaba lo que somos. Pedimos disculpas publicamente. Ya estamos hablando con [@usuario] para hacerlo bien."

## 8. Brands que ganan comunidad (patrones extraibles)

### Duolingo (TikTok, IG)
- Persona clara: el owl bully-carinoso. Cada respuesta tiene tono consistente aunque varie el CM.
- Reference: participan en trends con auto-deprecacion ("your Spanish streak just died").
- Extraible: define una PERSONA (age, humor, referencias culturales) antes de contratar CM. Documento de 2 paginas.

### Wendy's (X/Twitter)
- Roasteos suaves a competencia y a clientes que se pasan. Nunca cruzan a insultos.
- Engagement rate en respuestas 15-25x el organico.
- Extraible: humor solo funciona si el brand manager firma un "roast policy" (que si, que no, que zona gris) — sin eso, un CM va a cruzar linea y hay crisis.

### Aldi UK (X)
- Reactivan a competencia con humor pasivo-agresivo. Caso Colin the Caterpillar vs M&S: guerra de tuits que le dio £5M en earned media.
- Extraible: identificar 1 rival cultural (no legal) y jugar con eso 1-2 veces al mes, no diario.

### Innocent Drinks (X, IG)
- Tono absurdo, conversacional, casi random. "Random Tuesday facts" que no venden nada.
- Extraible: 30% del contenido no vende, solo entretiene → dispara reach organico y luego los posts de producto se benefician.

## 9. Mini case studies

### 9.1 Ryanair TikTok (Aug 2023 → hoy)
- Estrategia: CM se apropia de las quejas comunes (asientos chicos, extras caros) con auto-humor.
- Resultado: de 200k a 2.5M seguidores TikTok en 18 meses. Engagement rate 12% (aereas suelen 0.8%).
- Leccion: convertir tu peor review en tu chiste interno. Vulnerabilidad > defensiva.

### 9.2 Rappi Colombia (2022)
- Situacion: 3 quejas virales en 1 semana sobre servicio de repartidores.
- Accion: CM contesto cada una publicamente con caso especifico (num de guia, nombre de rappitendero, compensacion clara) en <30min.
- Resultado: sentiment paso de -22 a +18 en 10 dias. Reclamos publicos bajaron 40% el mes siguiente porque los usuarios vieron que si respondian bien.
- Leccion: velocidad + concrecion > silencio o comunicado corporativo.

### 9.3 CG Moda Style (Colombia, 2024)
- Baseline: response rate 62%, avg FRT IG DM 8h, sentiment +18.
- Cambios: playbook implementado, 2 CMs con turnos rotativos 8-22h, framework HEART obligatorio.
- 90 dias despues: response rate 96%, FRT IG DM 45min, sentiment +47. NPS comunidad +32 (medido con encuesta a top 200 followers activos).

## 10. Checklist de arranque (primeros 7 dias de un CM nuevo)

Dia 1: leer brand book, tone of voice, este playbook. Sombra al CM senior 4h.
Dia 2: shadow + escribe 10 respuestas en doc (no publicar) para revision.
Dia 3: primeras 5 respuestas reales bajo supervision.
Dia 4-5: solo bajo revision batch (senior mira antes de send).
Dia 6: rutina completa independiente, senior audita al final del dia.
Dia 7: retro 1:1, ajustes, semana 2 solo.

Toolkit minimo: acceso Meta Business Suite / TikTok Business / Sprout o Metricool / Google Alerts / Notion (para docs de casos recurrentes) / Grammarly Business (ES+EN) / Slack.
