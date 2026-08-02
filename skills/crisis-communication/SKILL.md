---
name: "crisis-communication"
description: "When the user faces a brand crisis, viral negative content, product recall, employee misconduct, data breach, boycott, or needs a pre-crisis preparedness plan. Use for incident triage, holding statements, war-room activation, post-mortem. NOT for daily community management (use community-engagement-playbook) or influencer disputes only. Related: community-engagement-playbook, brand-guidelines."
license: MIT
metadata:
  version: 1.0.0
  author: Community Manager Platform
  category: community
  updated: 2026-08-01
---

# Crisis Communication Protocol

Protocolo operacional para agencia y equipo in-house cuando la marca esta bajo fuego. Diseno basado en casos reales LATAM + globales. Objetivo: bajar el ruido, proteger el trust equity, evitar amplificar por error.

## 1. Definicion de crisis (matriz severity)

No todo comentario negativo es crisis. Uso una matriz de 3 ejes.

### Ejes
- **Severity (S)**: impacto potencial en trust, ventas, legal. 1 (bajo) a 5 (catastrofico).
- **Spread (P)**: velocidad de propagacion en 24h (menciones, alcance, cross-platform). 1 (contenido) a 5 (viral fuera de RRSS, medios tradicionales pegados).
- **Topic (T)**: sensibilidad del tema. 1 (producto menor) a 5 (dano a persona, discriminacion, ilegal).

**Score = S × P × T**. Rangos:
- **1-15**: incidente. CM resuelve con playbook estandar (`community-engagement-playbook`).
- **16-40**: crisis nivel 1. Activar Comms Lead + Brand Manager. War room ligero.
- **41-80**: crisis nivel 2. Activar todo el crisis team, holding statement en <2h.
- **81-125**: crisis nivel 3 (catastrofica). CEO involucrado, legal, PR externa, posible pausa de todo el marketing programado.

### Ejemplos de scoring
- 10 comments quejandose de envio lento: S=2, P=1, T=2 → 4. Incidente.
- Video de 200k views de cliente insatisfecho con foto de producto defectuoso: S=3, P=3, T=2 → 18. Crisis nivel 1.
- Video de empleado siendo racista con cliente, 500k views, medios lo tomaron: S=5, P=4, T=5 → 100. Crisis nivel 3.
- Data breach reportado por usuario: S=5, P=varia, T=5 → minimo 25 desde el minuto 1. Crisis nivel 2 baseline.

## 2. La primera hora (0-60 minutos): minuto a minuto

### 0-5 min: detectar y calificar
- Quien detecta: CM en turno, social listening tool (Brand24, Meltwater, Mention) con alerta configurada `mentions>10 en 15min` o `sentiment drop >30%`.
- Accion: NO responder aun. Screenshot todo (comentarios, video, cross-posts). Timestamp cada uno.
- Calificar con matriz de la seccion 1.

### 5-15 min: activar el war room
- Si score >15: notificar en Slack canal `#crisis-alerts` con formato:
  ```
  ALERTA – tema: [1 frase]
  score inicial: [S×P×T]
  fuente: [URL + screenshot]
  velocidad: [menciones en ultima hora]
  status: recopilando info
  responsable: [nombre CM]
  ```
- Llamada de 5-10 min (no meeting con 15 personas): Incident Commander (IC) + Comms Lead + Legal on call.

### 15-30 min: alinear hechos
- Que sabemos que es cierto (con evidencia)?
- Que estamos verificando (con quien, cuando responden)?
- Que NO sabemos y no debemos decir?
- Regla de oro: nunca hablamos de lo que no tenemos verificado. Cero especulacion publica.

### 30-45 min: draft del holding statement
- Escrito por Comms Lead, revisado por Legal, aprobado por Brand Manager.
- Formato: ver seccion 5.
- Traducir a ES+EN si el reach es internacional.
- Preparar canal: comment fijado en post viral / historia IG / thread X / statement en Web / DM a periodistas si aplica.

### 45-60 min: publicar holding statement
- Publicar por TODOS los canales relevantes al mismo tiempo (no goteo — genera desconfianza).
- Un solo vocero (no 3 CMs distintos escribiendo distinto).
- Bajar/pausar todo el contenido promocional programado en las proximas 24h.
- Monitor: dashboard en vivo con menciones + sentiment cada 15 min.

## 3. Roles del crisis team

Definir estos roles ANTES de la crisis, con nombre y celular. No improvisar.

- **Incident Commander (IC)**: toma decisiones finales de comunicacion. Puede ser Head of Marketing o COO. Un solo IC por crisis.
- **Comms Lead**: redacta statements, coordina canales, habla con periodistas.
- **Legal Counsel**: revisa cada statement antes de publicar. Puede vetar. Tiene 30 min max de review, no eternamente.
- **Client Contact** (si es agencia): informa al cliente cada 2h con updates factuales. No opina, solo reporta.
- **Community Manager**: ejecuta en canales, monitorea sentiment, escala nuevos temas.
- **CEO/Founder**: solo aparece publicamente si S=5. Su voz es municion nuclear, no se gasta en crisis pequenas.
- **PR externa** (opcional): si el tema salta a medios tradicionales — activar agencia PR con retainer definido.

Cada rol tiene backup nombrado. Si el IC no contesta en 15 min → backup asume.

## 4. Framework PACE (mensaje base)

Cada comunicacion oficial durante una crisis pasa por los 4 pasos, en orden.

### P – Pause (Pausa antes de hablar)
No es no comunicar. Es no responder emocional. 15 min minimo entre detectar y publicar.
Suprimir: emojis, exclamaciones, defensivas ("pero es que"), whataboutism.

### A – Acknowledge (Reconocer)
Nombrar el hecho sin evadir. Si es cierto que paso algo, decir que paso. Si no esta verificado, decir "estamos investigando".
Bueno: "Estamos al tanto del video que circula desde anoche mostrando [hecho]."
Malo: "Hemos visto comentarios en redes." (evasivo, insulta la inteligencia).

### C – Contain (Contener el dano)
Que estamos haciendo AHORA para que no siga pasando. Accion concreta con timeframe.
Bueno: "Suspendimos la operacion en la sucursal X mientras completamos la investigacion interna, con timeframe de 72h."
Malo: "Tomaremos las medidas necesarias." (vacio).

### E – Explain (Explicar lo que sigue)
Que van a comunicar y cuando. Fijar la proxima cita informativa.
Bueno: "Publicaremos update oficial el viernes 3pm con los resultados de la investigacion, sin importar si son favorables o no para nosotros."
Malo: "Iremos informando." (no compromete).

## 5. Templates de holding statements

### 5.1 Holding statement generico (ES) — para crisis nivel 1-2, primeras 2h
"Estamos al tanto de [describir hecho brevemente, sin adjetivos] que se reporto desde [hora / plataforma]. Nuestro equipo esta investigando desde el primer minuto y trabajando con [personas afectadas / autoridad / partner]. Publicaremos update con informacion verificada el [dia, hora especifica]. Agradecemos a quienes nos han contactado directamente — respondemos cada mensaje en orden."

### 5.1b Generic holding statement (EN)
"We are aware of [describe fact briefly, no adjectives] reported since [time / platform]. Our team has been investigating since minute one and is working with [affected parties / authorities / partner]. A verified update will be published on [day, exact time]. Thanks to everyone reaching out directly — we're responding to each message in order."

### 5.2 Producto defectuoso / recall (ES)
"Hoy [fecha] tomamos la decision de retirar del mercado el lote [numero] del producto [nombre], luego de [numero] reportes verificados de [defecto]. Si compraste este producto entre [fecha inicio] y [fecha fin], NO lo uses. Escribinos a [email/tel] para reembolso total y coordinacion de recoleccion sin costo. Estamos en contacto con [entidad reguladora si aplica: INVIMA/COFEPRIS/AESAN]. Actualizamos aca cada 12h hasta cerrar el ciclo."

### 5.3 Empleado en video viral con conducta inadecuada (ES)
"Vimos el video que circula desde anoche mostrando la conducta de una persona vinculada a nuestra empresa en [sucursal/canal]. Lo que se ve NO representa lo que somos ni lo que esperamos de nadie en este equipo. Ya iniciamos investigacion interna con [firma externa / RRHH] y la persona esta suspendida mientras se completa el proceso. Estamos en contacto con [cliente afectado si aplica] para pedir disculpas directamente. Comunicaremos las decisiones tomadas el [dia, hora]."

### 5.4 Data breach (ES)
"Detectamos [fecha, hora] un incidente de seguridad que expuso [tipo de datos: emails / passwords / datos parciales de tarjeta]. Impacto estimado: [numero] cuentas. Ya (a) cerramos la brecha, (b) reseteamos passwords de las cuentas afectadas, (c) contratamos [firma forense] para investigacion, (d) notificamos a [SIC/AGPD/autoridad relevante]. Si tu cuenta estuvo entre las afectadas, recibiste email hoy a las [hora] con pasos. NO usaremos telefonicamente para pedirte informacion adicional — desconfia de cualquier llamada que diga ser de nosotros. FAQ completa: [link]."

### 5.5 Escasez / falla de servicio masiva (ES)
"Desde las [hora] tenemos una caida parcial de [servicio]. Sabemos que [X% de usuarios] estan afectados. Equipo tecnico trabajando desde el minuto uno. Update cada 30 min en esta cuenta y en status.marca.com. Compensamos automaticamente [credito / dia extra / etc] a cada usuario afectado, sin necesidad de reclamar."

### 5.6 Boycott / hashtag hostil (ES)
"Vimos las conversaciones bajo #[hashtag] desde [hora]. Estamos leyendo cada comentario y agrupando los temas de fondo. En 48h publicaremos un video de [nombre CEO/vocero] respondiendo especificamente a cada punto planteado — no un comunicado corporativo, respuesta real. Mientras tanto, si tenes un caso concreto o pregunta directa, respondemos por DM."

### 5.7 Fake news atribuida a la marca (ES)
"Esta circulando una imagen/screenshot que afirma que [descripcion breve]. Esa comunicacion NO es nuestra: (a) no publicamos por [canal donde aparece] (b) no usamos el formato [detalle visual identificable] (c) verifica cualquier comunicacion oficial en [canales oficiales listados]. Estamos con Legal evaluando acciones. Si viste esto reenviado, ayudanos aclarando en el chat/hilo."

### 5.8 Post-crisis vuelta a la normalidad (ES)
"Han pasado [X dias] desde [tema]. Aca lo que hicimos: [3 acciones concretas con evidencia]. Aca lo que aprendimos: [2 aprendizajes honestos, no PR]. Aca lo que cambia hacia adelante: [2 cambios estructurales, no cosmeticos]. Gracias a quienes nos dieron feedback duro — nos sirvio mas que el aplauso. Cerramos capitulo, no lo olvidamos."

## 6. Do's y don'ts (los 10 errores clasicos)

### DO
1. Responder rapido con transparencia parcial > tarde con perfeccion.
2. Un solo vocero por canal, mensaje coherente.
3. Bajar el contenido programado promocional.
4. Documentar TODO internamente (Notion/Confluence) para postmortem y legal.
5. Contactar a afectados individualmente por DM/tel, no solo publico.

### DON'T
1. **Silencio > 4h en crisis nivel 2+**: se lee como culpabilidad o desprecio.
2. **Borrar comments/posts negativos**: se detecta en screenshot y explota 3x. Solo borrar spam/insulto claro.
3. **Deflectar**: "otras marcas tambien", "no es lo que parece". Insulta al usuario.
4. **Apology theater**: "profundamente lamentamos", "tomamos muy en serio". Vacio total. Si no hay accion concreta, no digas nada.
5. **Discutir con haters**: bajas al nivel, das reach al ataque.
6. **Comunicar internamente por WhatsApp personal**: sin trazabilidad, riesgo legal. Usa Slack corporativo o similar.
7. **Culpar a empleado individual en publico**: incluso si es cierto. Se procesa internamente, no delante del cliente.
8. **Prometer lo que no cumples**: "resolvemos en 24h" y a las 30h siguen sin respuesta → duplica la crisis.
9. **Copiar la voz de otra marca**: si Wendy's hace jokes en crisis, no significa que tu marca deba. Peor si es tema serio.
10. **Volver al contenido normal antes de tiempo**: publicar un meme el dia despues de una crisis grave = insensible = trending negativo.

## 7. Post-crisis: el postmortem interno

Reunion 5-10 dias despues de que cerro el ciclo publico. Duracion 90 min, formato blame-free (culpa al proceso, no a personas).

### Estructura del doc de postmortem (Notion/Confluence)
1. **Timeline factual**: minuto a minuto de las primeras 8h, luego dia por dia hasta cierre.
2. **Que hicimos bien**: 3-5 puntos concretos, con evidencia.
3. **Que hicimos mal**: 3-5 puntos concretos, sin excusas.
4. **Impacto medido**: (a) sentiment antes/durante/despues, (b) followers ganados/perdidos, (c) menciones en medios, (d) impacto en ventas si medible, (e) costo directo (compensaciones, PR externa, legal, etc).
5. **Cambios estructurales**: que se modifica en procesos/tools/personas. Owner + deadline por cada uno.
6. **Nuevo playbook**: incorporar el aprendizaje a este documento.

Distribuir el postmortem a: crisis team + brand manager + CEO. NO se publica externamente sin filtrado legal.

## 8. Case studies reales

### 8.1 Rappi Colombia 2020 – rappitenderos en cuarentena
- Situacion: durante cuarentena estricta, videos virales mostraron rappitenderos sin proteccion, sin bono, trabajando 14h.
- Reaccion inicial: silencio 3 dias. #boicotrappi trending.
- Correccion: CEO publico un video (no comunicado escrito) explicando plan de proteccion, bono de $500k a cada rappitendero, seguros pandemicos.
- Leccion: silencio de 3 dias = amplifica x5. Si CEO hubiera respondido a las 24h, dano hubiera sido 30% del que fue.

### 8.2 Falabella Chile 2022 – outfit racista
- Situacion: coleccion infantil con print interpretado como racista. Foto viraliza en X, salto a medios en 6h.
- Reaccion: retiraron producto en 12h, statement claro asumiendo error de diseno, donacion a fundacion antirracista, cambio en policy de aprobacion de coleccion (ahora pasa por diversity review).
- Resultado: sentiment se recupero en 3 semanas, coleccion siguiente record de ventas.
- Leccion: reconocimiento total + accion estructural > excusa. La donacion solo funciono porque vino con el cambio de policy.

### 8.3 Bimbo Mexico 2019 – hormiga en pan
- Situacion: foto de hormiga dentro de pan de caja. Viral en FB con 200k shares en 48h.
- Reaccion: respuesta en <3h del CM asumiendo, retiro de lote, cliente contactada con visita en persona del gerente de planta + regalo simbolico. Video del proceso de fabricacion publicado.
- Resultado: la cliente publico segundo post positivo. Bimbo gano trust en vez de perder.
- Leccion: sobrecomunicar el proceso ("asi hacemos las cosas") desactiva la percepcion de "es una mala marca".

### 8.4 Sprite Colombia 2021 – campana "las mujeres no beben Sprite"
- Situacion: campana con estereotipo de genero mal ejecutada. Boicot en 24h.
- Reaccion: retiraron la campana en 6h, pidieron disculpas escritas, hicieron una campana nueva con voces femeninas.
- Error: el statement inicial dijo "no era nuestra intencion", frase que amplifico el enojo (parecia minimizar).
- Leccion: nunca digas "no era la intencion". Di "nos equivocamos". Punto.

### 8.5 Avianca 2020 – bankruptcy comms
- Situacion: proceso Chapter 11 con miles de pasajeros con vuelos comprados.
- Reaccion: video del CEO honesto explicando proceso, FAQ actualizada diaria, atencion 24/7 dedicada, refunds en 60 dias.
- Resultado: brand equity NO cayo (dato interno), lealtad se mantuvo en 78% post-bankruptcy vs 82% pre.
- Leccion: transparencia proactiva en crisis financiera preserva mas trust que silencio corporativo.

## 9. Dark scenarios (planes de contingencia)

Ejercicio anual: simular cada escenario, medir tiempo de reaccion del equipo.

### 9.1 Video viral de empleado con conducta inapropiada
- Trigger: video >100k views en <24h.
- Playbook: seccion 5.3 template. Investigacion interna en 48h. Comunicacion de decision en 72h.
- Preparado: contacto de firma externa de investigacion HR + plantilla de suspension.

### 9.2 Data breach
- Trigger: reporte de usuario o alerta interna de seguridad.
- Playbook: seccion 5.4 template. Legal + CISO en <30 min. Notificacion a autoridad en <72h (GDPR/LOPD-LATAM).
- Preparado: retainer con firma forense, plantilla de email a afectados, canal directo con reguladores.

### 9.3 Product recall (dano fisico)
- Trigger: >3 reportes similares de dano fisico por producto.
- Playbook: seccion 5.2 template. Retiro voluntario antes de que autoridad obligue (mejor optica).
- Preparado: lista de lotes trazables, contacto con retailers principales, presupuesto de recall.

### 9.4 Fake news con imagen falsa atribuida a la marca
- Trigger: circulacion de "comunicado" falso.
- Playbook: seccion 5.7. Aclaracion en <2h. Reporte a plataforma. Legal evalua accion contra creador.
- Preparado: canales oficiales listados publicamente con badges. Guia de "como identificar comunicacion real de la marca".

### 9.5 Employee misconduct fuera del trabajo pero afectando marca
- Trigger: post personal ofensivo de empleado se viraliza.
- Playbook: aclarar que es opinion personal (si aplica) o suspender+investigar si va contra codigo.
- Preparado: codigo de conducta publico y firmado por cada empleado incluyendo social media policy.

## 10. Checklist pre-crisis (tener listo ANTES)

- [ ] Crisis team con roles, backups, telefonos. Actualizado cada trimestre.
- [ ] Matriz de escalation aprobada por CEO.
- [ ] Templates de holding statements (secc 5) traducidos ES+EN y firmados por Legal.
- [ ] Contactos: agencia PR externa (retainer), firma legal, firma forense (data), agencia investigacion HR, tools de monitoring (Meltwater/Brand24 con alertas configuradas).
- [ ] Access a status page tipo status.marca.com para outages.
- [ ] Slack canal #crisis-alerts con integraciones (Mention, Google Alerts, PagerDuty).
- [ ] Simulacro semestral con 1 escenario random (post-mortem al ejercicio).
- [ ] Log historico de crisis previas con postmortems para consulta.
- [ ] Policy documental publico: social media conduct para empleados, codigo etico, whistleblower channel.
- [ ] Training a CMs y voceros: media training + crisis role play cada 6 meses.

## 11. Metricas de la crisis

Trackear en dashboard live durante crisis (Google Data Studio / Looker):
- **Menciones por hora** (cross-platform).
- **Sentiment score** (por hora, target: no bajar mas de -20 tras el statement).
- **Share of voice** vs la conversacion (evitar que tu voz sea <20% del total mencionado sobre el tema).
- **Followers netos** (perdida vs ganancia — algunas crisis atraen defensores).
- **Traffic a site** (spike o crash?).
- **Ventas comparadas** al mismo dia semana anterior.
- **NPS pulse** encuesta corta a base de clientes 7 dias post-crisis.

Reportar al board: 24h, 72h, 30 dias post-crisis.

## 12. Recurso: cuando NO responder

No toda mencion negativa merece respuesta. Reglas:
- 1 comment negativo <5 likes, sin engagement adicional → NO responder publico, resolver por DM si aplica.
- Meme satirico sin call-to-action → ignorar. Responder da reach al meme.
- Critica constructiva legitima (blog, podcast) sin amplificacion viral → responder al autor 1-a-1, no publico.
- Post de competidor atacando → nunca responder directo. Se maneja legal si cruza linea, o se ignora.

Regla final: la crisis peor gestionada es la que se amplifica por sobre-reaccionar a un comment aislado.
