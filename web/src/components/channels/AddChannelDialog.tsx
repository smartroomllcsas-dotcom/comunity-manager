"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppConnect } from "./WhatsAppConnect";
import { RespondIoConnect } from "./RespondIoConnect";
import { MessageSquare, Camera, Send, Network } from "lucide-react";

interface AddChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChannelAdded?: () => void;
}

interface ChannelOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
  category: string[];
}

const channelOptions: ChannelOption[] = [
  {
    id: "respond_io",
    name: "Respond.io (multi-canal)",
    description:
      "Conecta vía Respond.io y gestiona WhatsApp, Messenger, Instagram, Telegram, LINE, Viber, WeChat, SMS, Email y Web Chat desde una sola integración.",
    icon: <Network className="h-8 w-8 text-violet-500" />,
    available: true,
    category: ["todos", "mensajeria", "sms", "ubicados"],
  },
  {
    id: "whatsapp_business_api",
    name: "WhatsApp Business Platform (API)",
    description:
      "Conecta WhatsApp Business API a través de Facebook para facilitar la mensajería y la atención al cliente.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-green-500 fill-current">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    available: true,
    category: ["todos", "mensajeria"],
  },
  {
    id: "facebook_messenger",
    name: "Facebook Messenger",
    description:
      "Conecta Facebook Messenger para interactuar con tus clientes en la plataforma de datos más grande del mundo.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-blue-500 fill-current">
        <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.2l3.131 3.26 5.886-3.26-6.558 6.763z" />
      </svg>
    ),
    available: false,
    category: ["todos", "mensajeria"],
  },
  {
    id: "instagram",
    name: "Instagram",
    description:
      "Conecta Instagram para responder a mensajes privados y crear relaciones.",
    icon: <Camera className="h-8 w-8 text-pink-500" />,
    available: false,
    category: ["todos", "mensajeria"],
  },
  {
    id: "telegram",
    name: "Telegram",
    description:
      "Conecta Telegram Bot para llegar usuarios en tiempo real.",
    icon: <Send className="h-8 w-8 text-blue-400" />,
    available: false,
    category: ["todos", "mensajeria"],
  },
  {
    id: "tiktok",
    name: "TikTok",
    description:
      "Conecta TikTok para interactuar con tu audiencia directamente.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.51a8.27 8.27 0 004.76 1.5V6.69h-1z" />
      </svg>
    ),
    available: false,
    category: ["todos", "mensajeria"],
  },
  {
    id: "webchat",
    name: "Web Chat",
    description:
      "Agrega un widget de chat en vivo a tu sitio web para atender visitantes.",
    icon: <MessageSquare className="h-8 w-8 text-indigo-500" />,
    available: false,
    category: ["todos", "ubicados"],
  },
];

const tabs = [
  { value: "todos", label: "Todos" },
  { value: "mensajeria", label: "Mensajería Empresarial" },
  { value: "ubicados", label: "Ubicados" },
  { value: "sms", label: "SMS" },
];

export function AddChannelDialog({
  open,
  onOpenChange,
  onChannelAdded,
}: AddChannelDialogProps) {
  const [, setActiveTab] = useState("todos");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Añadir canal</DialogTitle>
          <DialogDescription>
            Selecciona un canal para conectar con tus clientes.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="todos" onValueChange={setActiveTab}>
          <TabsList variant="line">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => {
            const tabChannels = channelOptions.filter((ch) =>
              ch.category.includes(tab.value),
            );
            return (
            <TabsContent key={tab.value} value={tab.value}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {tabChannels.length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-2 text-center py-8">
                    No hay canales disponibles en esta categoria.
                  </p>
                ) : (
                  tabChannels.map((channel) => (
                    <Card
                      key={channel.id}
                      className="relative overflow-hidden"
                    >
                      <CardContent className="p-4 flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0">{channel.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-semibold truncate">
                                {channel.name}
                              </h3>
                              {!channel.available && (
                                <Badge variant="secondary" className="text-[10px] shrink-0">
                                  Proximamente
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {channel.description}
                            </p>
                          </div>
                        </div>
                        <div className="mt-auto">
                          {channel.id === "whatsapp_business_api" &&
                          channel.available ? (
                            <WhatsAppConnect
                              onSuccess={() => {
                                onChannelAdded?.();
                                onOpenChange(false);
                              }}
                              onError={(err) => {
                                console.error("WhatsApp connect error:", err);
                              }}
                            />
                          ) : channel.id === "respond_io" &&
                            channel.available ? (
                            <RespondIoConnect
                              onSuccess={() => {
                                onChannelAdded?.();
                                onOpenChange(false);
                              }}
                              onError={(err) => {
                                console.error("Respond.io connect error:", err);
                              }}
                            />
                          ) : (
                            <Button
                              variant="outline"
                              className="w-full"
                              disabled={!channel.available}
                            >
                              {channel.available
                                ? "Conectar"
                                : "Proximamente"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
