-- 049 · El orden del Inbox sigue al último mensaje real.
--
-- La lista se ordena por conversations.updated_at, pero no todos los caminos
-- que insertan mensajes (respuesta del asesor, agente IA, difusiones, eco del
-- celular en el QR) la actualizaban, y marcar como leído SÍ la actualizaba:
-- abrir un chat lo subía al inicio y responder no siempre. Este trigger hace
-- que cualquier mensaje nuevo (entrante o saliente) mueva la conversación,
-- usando la fecha del mensaje (los del QR traen la hora real de WhatsApp).
-- Idempotente.
SET search_path TO smarttalk, public;

CREATE OR REPLACE FUNCTION smarttalk.touch_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE smarttalk.conversations
     SET updated_at = GREATEST(COALESCE(updated_at, NEW.created_at), COALESCE(NEW.created_at, NOW()))
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversation_on_message ON smarttalk.messages;
CREATE TRIGGER trg_touch_conversation_on_message
AFTER INSERT ON smarttalk.messages
FOR EACH ROW EXECUTE FUNCTION smarttalk.touch_conversation_on_message();

-- Alinear el orden actual con el último mensaje de cada conversación.
UPDATE smarttalk.conversations c
   SET updated_at = m.last_at
  FROM (SELECT conversation_id, MAX(created_at) AS last_at FROM smarttalk.messages GROUP BY conversation_id) m
 WHERE m.conversation_id = c.id AND m.last_at > c.updated_at;
