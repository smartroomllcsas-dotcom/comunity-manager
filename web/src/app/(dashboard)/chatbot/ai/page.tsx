"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  useAIAgents,
  useCreateAIAgent,
  useUpdateAIAgent,
  useDeleteAIAgent,
  useToggleAIAgent,
  useTestAIAgent,
  useAddKnowledgeSource,
  useDeleteKnowledgeSource,
} from "@/hooks/useAIAgents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Bot,
  Sparkles,
  Shield,
  ShoppingCart,
  Settings2,
  Send,
  RotateCcw,
  FileText,
  Globe,
  X,
  Pencil,
  Loader2,
  MessageSquare,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import type { AIAgent, AIActionConfig, AIActionType, KnowledgeSource } from "@/types/database";

export const dynamic = "force-dynamic";

/* ─── Constants ─── */
const AGENT_TYPE_META: Record<
  string,
  { label: string; color: string; icon: typeof Bot }
> = {
  receptionist: {
    label: "Recepcionista",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Bot,
  },
  sales: {
    label: "Ventas",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: ShoppingCart,
  },
  support: {
    label: "Soporte",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    icon: Shield,
  },
  custom: {
    label: "Personalizado",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    icon: Settings2,
  },
};

const EMOJI_LIST = [
  "🤖", "💬", "🎯", "🚀", "💡", "🛡️", "🎪", "📞", "💼", "🏢",
  "⭐", "🔥", "💎", "🌟", "🎭", "🤝", "📊", "🧠", "🦾", "✨",
  "👋", "💰", "🏆", "🎁", "📦", "🔧", "💊", "🏥", "🍔", "✈️",
];

const TEMPLATE_PROMPTS: Record<string, { name: string; prompt: string }> = {
  receptionist: {
    name: "Recepcionista",
    prompt: `Eres un recepcionista virtual profesional y amable. Tu rol es:

1. Saludar cordialmente a cada nuevo visitante
2. Identificar rapidamente el motivo de su contacto
3. Recopilar informacion basica (nombre, empresa, necesidad)
4. Clasificar y enrutar al equipo o agente apropiado
5. Si no puedes resolver, escala al equipo correcto

Estilo: Profesional pero cercano. Respuestas concisas. Siempre ofrece opciones claras.
Idioma: Español.
Si el usuario pide hablar con un humano, usa [ACTION:assign_agent] inmediatamente.`,
  },
  sales: {
    name: "Agente de Ventas",
    prompt: `Eres un agente de ventas consultivo experto. Tu rol es:

1. Entender las necesidades del prospecto haciendo preguntas estrategicas
2. Presentar soluciones relevantes basadas en sus necesidades
3. Manejar objeciones con empatia y datos
4. Guiar hacia la conversion sin ser agresivo
5. Calificar leads y actualizar su etapa en el ciclo de vida

Estilo: Consultivo, empático, orientado a resultados. Usa preguntas abiertas.
Idioma: Español.
Cuando un lead esta listo para comprar, usa [ACTION:update_lifecycle:oportunidad] y [ACTION:assign_agent] para conectar con ventas.`,
  },
  support: {
    name: "Agente de Soporte",
    prompt: `Eres un agente de soporte tecnico experto y paciente. Tu rol es:

1. Identificar y comprender el problema del usuario
2. Buscar soluciones en la base de conocimiento
3. Proporcionar pasos claros y detallados para resolver el problema
4. Si no puedes resolver, escala al equipo tecnico
5. Siempre confirma que el problema fue resuelto antes de cerrar

Estilo: Paciente, tecnico pero accesible. Usa listas numeradas para instrucciones.
Idioma: Español.
Cuando el problema esta resuelto, usa [ACTION:close_conversation].
Si necesita escalacion, usa [ACTION:assign_team:soporte_tecnico].`,
  },
};

const ALL_ACTIONS: { type: AIActionType; label: string; description: string }[] = [
  { type: "close_conversation", label: "Cerrar conversaciones", description: "Permite al agente cerrar conversaciones resueltas" },
  { type: "assign_agent", label: "Asignar a agente o equipo", description: "Asigna la conversacion a un agente humano o equipo" },
  { type: "assign_team", label: "Asignar a equipo", description: "Asigna la conversacion a un equipo especifico" },
  { type: "update_lifecycle", label: "Actualizar ciclo de vida", description: "Cambia la etapa del contacto en el ciclo de vida" },
  { type: "update_contact_field", label: "Actualizar campos de contacto", description: "Modifica campos personalizados del contacto" },
  { type: "update_tag", label: "Actualizar etiquetas", description: "Agrega o modifica etiquetas del contacto" },
  { type: "add_comment", label: "Anadir comentarios", description: "Agrega notas internas a la conversacion" },
  { type: "trigger_workflow", label: "Activar flujos de trabajo", description: "Dispara un flujo de automatizacion" },
  { type: "http_request", label: "Realizar peticiones HTTP", description: "Envia solicitudes a APIs externas" },
];

function getDefaultActions(): AIActionConfig[] {
  return ALL_ACTIONS.map((a) => ({
    type: a.type,
    enabled: false,
    instructions: "",
    config: {},
  }));
}

/* ─── Main Page ─── */
export default function AIAgentsPage() {
  const { data: agents = [], isLoading } = useAIAgents();
  const createAgent = useCreateAIAgent();
  const updateAgent = useUpdateAIAgent();
  const deleteAgent = useDeleteAIAgent();
  const toggleAgent = useToggleAIAgent();

  const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [defaultAgentId, setDefaultAgentId] = useState<string>("");

  useEffect(() => {
    const def = agents.find((a) => a.is_default);
    if (def) setDefaultAgentId(def.id);
  }, [agents]);

  function handleCreate() {
    setEditingAgent(null);
    setIsCreating(true);
  }

  function handleEdit(agent: AIAgent) {
    setEditingAgent(agent);
    setIsCreating(true);
  }

  async function handleSetDefault(value: string | null) {
    const agentId = value || "";
    setDefaultAgentId(agentId);
    // Unset previous default
    const prev = agents.find((a) => a.is_default);
    if (prev && prev.id !== agentId) {
      await updateAgent.mutateAsync({ id: prev.id, is_default: false });
    }
    if (agentId && agentId !== "none") {
      await updateAgent.mutateAsync({ id: agentId, is_default: true });
    }
  }

  async function handleDelete(agentId: string) {
    if (!confirm("¿Estas seguro de eliminar este agente IA?")) return;
    await deleteAgent.mutateAsync(agentId);
  }

  if (isCreating) {
    return (
      <AgentEditor
        agent={editingAgent}
        onClose={() => setIsCreating(false)}
      />
    );
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link
          href="/chatbot"
          className="text-[#8b949e] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Agentes IA</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">
            Configura agentes de inteligencia artificial con Anthropic Claude
            para automatizar conversaciones
          </p>
        </div>
        <div className="flex-1" />
        <Button
          onClick={handleCreate}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Crear Agente IA
        </Button>
      </div>

      <div className="p-6 max-w-6xl">
        {/* Default Agent Selector */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-white">
                Establecer Agente IA predeterminado
              </h2>
              <p className="text-xs text-[#8b949e]">
                Este agente se activara automaticamente en nuevas conversaciones
                sin flujo asignado
              </p>
            </div>
            <Select value={defaultAgentId} onValueChange={handleSetDefault}>
              <SelectTrigger className="w-[240px] bg-[#0d1117] border-[#2d333b] text-white h-9">
                <SelectValue placeholder="Seleccionar agente..." />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                <SelectItem value="none">Ninguno</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.emoji} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Agent Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 text-[#8b949e] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => {
              const meta = AGENT_TYPE_META[agent.agent_type] || AGENT_TYPE_META.custom;
              return (
                <div
                  key={agent.id}
                  className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4 hover:border-[#3d444d] transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-10 w-10 rounded-lg bg-[#0d1117] border border-[#2d333b] flex items-center justify-center text-lg">
                      {agent.emoji || "🤖"}
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">
                    {agent.name}
                    {agent.is_default && (
                      <span className="ml-2 text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                        Predeterminado
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-[#8b949e] mb-3 leading-relaxed line-clamp-2">
                    {agent.description || agent.system_prompt.slice(0, 100) + "..."}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#0d1117] hover:text-white text-xs h-7"
                        onClick={() => handleEdit(agent)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 text-xs h-7 px-2"
                        onClick={() => handleDelete(agent.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Switch
                      checked={agent.is_active}
                      onCheckedChange={() => toggleAgent.mutate(agent.id)}
                    />
                  </div>
                </div>
              );
            })}

            {/* Create Card */}
            <button
              onClick={handleCreate}
              className="bg-[#0d1117] border border-dashed border-[#2d333b] rounded-lg p-4 hover:border-blue-500/50 hover:bg-[#1a1f2e]/50 transition-all flex flex-col items-center justify-center gap-2 min-h-[180px]"
            >
              <div className="h-10 w-10 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <Plus className="h-5 w-5 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-blue-400">
                Crear Agente IA
              </span>
              <span className="text-xs text-[#8b949e]">
                Personaliza un nuevo agente
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Agent Editor Panel ─── */
function AgentEditor({
  agent,
  onClose,
}: {
  agent: AIAgent | null;
  onClose: () => void;
}) {
  const createAgent = useCreateAIAgent();
  const updateAgent = useUpdateAIAgent();
  const addSource = useAddKnowledgeSource();
  const deleteSource = useDeleteKnowledgeSource();
  const testAgent = useTestAIAgent();

  const isNew = !agent;

  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(agent?.description || "");
  const [showDescription, setShowDescription] = useState(!!agent?.description);
  const [emoji, setEmoji] = useState(agent?.emoji || "🤖");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [agentType, setAgentType] = useState(agent?.agent_type || "custom");
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt || "");
  const [maxTokens, setMaxTokens] = useState(agent?.max_tokens || 1024);
  const [actions, setActions] = useState<AIActionConfig[]>(() => {
    if (agent?.actions && agent.actions.length > 0) {
      // Merge with all possible actions to ensure all are present
      const existing = new Map(agent.actions.map((a) => [a.type, a]));
      return ALL_ACTIONS.map((a) => existing.get(a.type) || { type: a.type, enabled: false, instructions: "", config: {} });
    }
    return getDefaultActions();
  });
  const [saving, setSaving] = useState(false);

  // Knowledge sources
  const [sources, setSources] = useState<KnowledgeSource[]>(agent?.knowledge_sources || []);
  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceType, setSourceType] = useState<"text" | "url">("text");
  const [sourceName, setSourceName] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  // Test panel
  const [testMessages, setTestMessages] = useState<
    { role: "user" | "assistant"; content: string; actions?: { type: string; label: string }[] }[]
  >([]);
  const [testInput, setTestInput] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const testEndRef = useRef<HTMLDivElement>(null);

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    config: true,
    instructions: true,
    actions: false,
    knowledge: false,
    test: false,
  });

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    testEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [testMessages]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: showDescription ? description : null,
        emoji,
        agent_type: agentType,
        system_prompt: systemPrompt,
        actions,
        max_tokens: maxTokens,
      };

      if (isNew) {
        await createAgent.mutateAsync(payload as Parameters<typeof createAgent.mutateAsync>[0]);
      } else {
        await updateAgent.mutateAsync({ id: agent.id, ...payload } as Parameters<typeof updateAgent.mutateAsync>[0]);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSource() {
    if (!agent?.id) return;
    if (!sourceName.trim()) return;
    const body: Parameters<typeof addSource.mutateAsync>[0] = {
      agentId: agent.id,
      type: sourceType,
      name: sourceName.trim(),
    };
    if (sourceType === "text") body.content = sourceContent.trim();
    else body.url = sourceUrl.trim();

    const newSource = await addSource.mutateAsync(body);
    setSources((prev) => [newSource, ...prev]);
    setSourceName("");
    setSourceContent("");
    setSourceUrl("");
    setShowAddSource(false);
  }

  async function handleDeleteSource(sourceId: string) {
    if (!agent?.id) return;
    await deleteSource.mutateAsync({ agentId: agent.id, sourceId });
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
  }

  async function handleTest() {
    if (!agent?.id || !testInput.trim()) return;
    setIsTesting(true);

    const userMsg = testInput.trim();
    setTestInput("");
    const updatedHistory = [...testMessages, { role: "user" as const, content: userMsg }];
    setTestMessages(updatedHistory);

    try {
      const result = await testAgent.mutateAsync({
        id: agent.id,
        message: userMsg,
        conversationHistory: updatedHistory
          .filter((m) => !("actions" in m))
          .map((m) => ({ role: m.role, content: m.content })),
      });

      setTestMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.response,
          actions: result.actions,
        },
      ]);
    } catch {
      setTestMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error al generar respuesta. Verifica la configuracion." },
      ]);
    } finally {
      setIsTesting(false);
    }
  }

  function applyTemplate(key: string) {
    const tpl = TEMPLATE_PROMPTS[key];
    if (tpl) {
      setSystemPrompt(tpl.prompt);
      setAgentType(key as AIAgent["agent_type"]);
      if (!name) setName(`Agente ${tpl.name}`);
    }
  }

  function updateAction(type: AIActionType, updates: Partial<AIActionConfig>) {
    setActions((prev) =>
      prev.map((a) => (a.type === type ? { ...a, ...updates } : a))
    );
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22] sticky top-0 z-10">
        <button
          onClick={onClose}
          className="text-[#8b949e] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">
            {isNew ? "Crear Agente IA" : `Editar: ${agent.name}`}
          </h1>
          <p className="text-xs text-[#8b949e] mt-0.5">
            {isNew
              ? "Configura un nuevo agente de inteligencia artificial"
              : "Modifica la configuracion del agente"}
          </p>
        </div>
        <div className="flex-1" />
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          {saving ? "Guardando..." : isNew ? "Crear Agente" : "Guardar cambios"}
        </Button>
      </div>

      <div className="flex">
        {/* Main Editor */}
        <div className="flex-1 p-6 max-w-4xl space-y-4 overflow-y-auto">
          {/* Section 1: Configuracion */}
          <CollapsibleSection
            title="Configuracion"
            icon={<Settings2 className="h-4 w-4" />}
            isOpen={openSections.config}
            onToggle={() => toggleSection("config")}
          >
            <div className="space-y-4">
              {/* Emoji picker */}
              <div className="space-y-2">
                <Label className="text-xs text-[#8b949e]">Icono</Label>
                <div className="relative">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="h-12 w-12 rounded-lg bg-[#0d1117] border border-[#2d333b] flex items-center justify-center text-2xl hover:border-[#3d444d] transition-colors"
                  >
                    {emoji}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-14 left-0 bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-3 z-20 grid grid-cols-10 gap-1 shadow-xl">
                      {EMOJI_LIST.map((e) => (
                        <button
                          key={e}
                          onClick={() => {
                            setEmoji(e);
                            setShowEmojiPicker(false);
                          }}
                          className="h-8 w-8 flex items-center justify-center text-lg rounded hover:bg-[#0d1117] transition-colors"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label className="text-xs text-[#8b949e]">Nombre</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Asistente de Ventas"
                  className="bg-[#0d1117] border-[#2d333b] text-white h-9"
                />
              </div>

              {/* Description toggle */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showDescription}
                    onCheckedChange={setShowDescription}
                  />
                  <Label className="text-xs text-[#8b949e]">
                    Descripcion
                  </Label>
                </div>
                {showDescription && (
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe brevemente el proposito del agente"
                    className="bg-[#0d1117] border-[#2d333b] text-white h-9"
                  />
                )}
              </div>

              {/* Type + Max tokens */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-[#8b949e]">Tipo</Label>
                  <Select
                    value={agentType}
                    onValueChange={(v) => { if (v) setAgentType(v); }}
                  >
                    <SelectTrigger className="bg-[#0d1117] border-[#2d333b] text-white h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                      {Object.entries(AGENT_TYPE_META).map(([key, meta]) => (
                        <SelectItem key={key} value={key}>
                          {meta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-[#8b949e]">
                    Max tokens de respuesta
                  </Label>
                  <Input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value) || 1024)}
                    className="bg-[#0d1117] border-[#2d333b] text-white h-9"
                  />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 2: Instrucciones */}
          <CollapsibleSection
            title="Instrucciones"
            icon={<MessageSquare className="h-4 w-4" />}
            isOpen={openSections.instructions}
            onToggle={() => toggleSection("instructions")}
          >
            <div className="space-y-3">
              <p className="text-xs text-[#8b949e]">
                Describe la funcion del agente de IA, su estilo de comunicacion
                y las acciones que debe realizar.
              </p>

              {/* Template buttons */}
              <div className="flex gap-2 flex-wrap">
                {Object.entries(TEMPLATE_PROMPTS).map(([key, tpl]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => applyTemplate(key)}
                    className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#0d1117] hover:text-white text-xs h-7"
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    {tpl.name}
                  </Button>
                ))}
              </div>

              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={12}
                placeholder="Eres un asistente virtual..."
                className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] resize-none font-mono text-sm"
              />
            </div>
          </CollapsibleSection>

          {/* Section 3: Acciones */}
          <CollapsibleSection
            title="Acciones"
            icon={<Zap className="h-4 w-4" />}
            isOpen={openSections.actions}
            onToggle={() => toggleSection("actions")}
            badge={`${actions.filter((a) => a.enabled).length} activas`}
          >
            <div className="space-y-3">
              {ALL_ACTIONS.map((actionMeta) => {
                const action = actions.find((a) => a.type === actionMeta.type);
                const isEnabled = action?.enabled || false;
                return (
                  <div
                    key={actionMeta.type}
                    className={`border rounded-lg p-3 transition-colors ${
                      isEnabled
                        ? "bg-[#0d1117] border-blue-500/30"
                        : "bg-[#0d1117]/50 border-[#2d333b]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white font-medium">
                          {actionMeta.label}
                        </p>
                        <p className="text-xs text-[#8b949e]">
                          {actionMeta.description}
                        </p>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(enabled) =>
                          updateAction(actionMeta.type, { enabled })
                        }
                      />
                    </div>
                    {isEnabled && (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={action?.instructions || ""}
                          onChange={(e) =>
                            updateAction(actionMeta.type, {
                              instructions: e.target.value,
                            })
                          }
                          placeholder="Instrucciones especificas para esta accion..."
                          rows={2}
                          className="bg-[#161b22] border-[#2d333b] text-white placeholder:text-[#8b949e] resize-none text-xs"
                        />
                        {actionMeta.type === "http_request" && (
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={(action?.config?.url as string) || ""}
                              onChange={(e) =>
                                updateAction(actionMeta.type, {
                                  config: {
                                    ...(action?.config || {}),
                                    url: e.target.value,
                                  },
                                })
                              }
                              placeholder="URL del endpoint"
                              className="bg-[#161b22] border-[#2d333b] text-white h-8 text-xs"
                            />
                            <Select
                              value={(action?.config?.method as string) || "POST"}
                              onValueChange={(method) =>
                                updateAction(actionMeta.type, {
                                  config: {
                                    ...(action?.config || {}),
                                    method,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="bg-[#161b22] border-[#2d333b] text-white h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                                <SelectItem value="PATCH">PATCH</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          {/* Section 4: Knowledge Sources */}
          <CollapsibleSection
            title="Fuentes de Conocimiento"
            icon={<FileText className="h-4 w-4" />}
            isOpen={openSections.knowledge}
            onToggle={() => toggleSection("knowledge")}
            badge={`${sources.length} fuentes`}
          >
            <div className="space-y-3">
              {!agent && (
                <p className="text-xs text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-3 py-2">
                  Guarda el agente primero para poder agregar fuentes de
                  conocimiento.
                </p>
              )}

              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-start gap-3 bg-[#0d1117] border border-[#2d333b] rounded-lg p-3"
                >
                  <div className="h-8 w-8 rounded bg-[#161b22] border border-[#2d333b] flex items-center justify-center shrink-0">
                    {source.type === "url" ? (
                      <Globe className="h-4 w-4 text-blue-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-green-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {source.name}
                    </p>
                    <p className="text-xs text-[#8b949e] truncate">
                      {source.type === "url"
                        ? source.url
                        : source.content?.slice(0, 80) + "..."}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[#8b949e] hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0 shrink-0"
                    onClick={() => handleDeleteSource(source.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {showAddSource ? (
                <div className="bg-[#0d1117] border border-[#2d333b] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white font-medium">
                      Agregar fuente
                    </p>
                    <button
                      onClick={() => setShowAddSource(false)}
                      className="text-[#8b949e] hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSourceType("text")}
                      className={`text-xs h-7 ${
                        sourceType === "text"
                          ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                          : "bg-transparent border-[#2d333b] text-[#8b949e]"
                      }`}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      Texto
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSourceType("url")}
                      className={`text-xs h-7 ${
                        sourceType === "url"
                          ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                          : "bg-transparent border-[#2d333b] text-[#8b949e]"
                      }`}
                    >
                      <Globe className="h-3 w-3 mr-1" />
                      URL
                    </Button>
                  </div>
                  <Input
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="Nombre de la fuente"
                    className="bg-[#161b22] border-[#2d333b] text-white h-9"
                  />
                  {sourceType === "text" ? (
                    <Textarea
                      value={sourceContent}
                      onChange={(e) => setSourceContent(e.target.value)}
                      placeholder="Pega aqui el contenido de conocimiento..."
                      rows={5}
                      className="bg-[#161b22] border-[#2d333b] text-white placeholder:text-[#8b949e] resize-none text-sm"
                    />
                  ) : (
                    <Input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://ejemplo.com/informacion"
                      className="bg-[#161b22] border-[#2d333b] text-white h-9"
                    />
                  )}
                  <Button
                    onClick={handleAddSource}
                    disabled={!sourceName.trim() || addSource.isPending}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {addSource.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1.5" />
                    )}
                    Agregar
                  </Button>
                </div>
              ) : (
                agent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddSource(true)}
                    className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#0d1117] hover:text-white text-xs"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Agregar fuente
                  </Button>
                )
              )}
            </div>
          </CollapsibleSection>

          {/* Section 5: Test Panel */}
          <CollapsibleSection
            title="Probar Agente"
            icon={<Send className="h-4 w-4" />}
            isOpen={openSections.test}
            onToggle={() => toggleSection("test")}
          >
            {!agent ? (
              <p className="text-xs text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-3 py-2">
                Guarda el agente primero para poder probarlo.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Chat messages */}
                <div className="bg-[#0d1117] border border-[#2d333b] rounded-lg h-[320px] overflow-y-auto p-4 space-y-3">
                  {testMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-[#8b949e]">
                      <Bot className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-xs">
                        Envia un mensaje para probar el agente
                      </p>
                    </div>
                  )}
                  {testMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-[#1a1f2e] border border-[#2d333b] text-[#c9d1d9]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {msg.actions.map((action, j) => (
                              <div
                                key={j}
                                className="flex items-center gap-1.5 text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded px-2 py-1"
                              >
                                <Zap className="h-3 w-3" />
                                [Accion: {action.label}]
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isTesting && (
                    <div className="flex justify-start">
                      <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg px-3 py-2">
                        <Loader2 className="h-4 w-4 text-[#8b949e] animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={testEndRef} />
                </div>

                {/* Input */}
                <div className="flex gap-2">
                  <Input
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleTest();
                      }
                    }}
                    placeholder="Escribe un mensaje de prueba..."
                    className="bg-[#0d1117] border-[#2d333b] text-white h-9"
                    disabled={isTesting}
                  />
                  <Button
                    onClick={handleTest}
                    disabled={isTesting || !testInput.trim()}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-3"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTestMessages([])}
                    className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#0d1117] hover:text-white h-9 px-3"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

/* ─── Collapsible Section Component ─── */
function CollapsibleSection({
  title,
  icon,
  isOpen,
  onToggle,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#161b22] transition-colors"
      >
        <span className="text-[#8b949e]">{icon}</span>
        <span className="text-sm font-semibold text-white">{title}</span>
        {badge && (
          <span className="text-[10px] text-[#8b949e] bg-[#0d1117] px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        <div className="flex-1" />
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-[#8b949e]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[#8b949e]" />
        )}
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
