"use client";
import { useEffect, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type ConnectionState = "idle" | "connecting" | "registering" | "syncing" | "success" | "error";

interface WhatsAppConnectProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

const stateConfig: Record<ConnectionState, { label: string; icon?: React.ReactNode }> = {
  idle: { label: "Conectar WhatsApp" },
  connecting: { label: "Conectando con WhatsApp..." },
  registering: { label: "Registrando número..." },
  syncing: { label: "Sincronizando plantillas..." },
  success: { label: "Canal conectado con éxito" },
  error: { label: "Error al conectar" },
};

export function WhatsAppConnect({ onSuccess, onError }: WhatsAppConnectProps) {
  const [state, setState] = useState<ConnectionState>("idle");
  const [sdkReady, setSdkReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }

    window.fbAsyncInit = () => {
      window.FB.init({
        appId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "",
        cookie: true,
        xfbml: true,
        version: "v21.0",
      });
      setSdkReady(true);
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  const handleConnect = useCallback(() => {
    if (!sdkReady || !window.FB) {
      setErrorMessage("Facebook SDK no esta listo. Intenta de nuevo.");
      setState("error");
      onError?.("Facebook SDK no esta listo. Intenta de nuevo.");
      return;
    }

    setState("connecting");
    setErrorMessage("");

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          const code = response.authResponse.code;

          setState("registering");

          fetch("/api/channels/whatsapp/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.error) {
                setErrorMessage(data.error);
                setState("error");
                onError?.(data.error);
              } else {
                setState("syncing");
                // Attempt template sync for the new channel
                const channelId = data.channel?.id;
                if (channelId) {
                  fetch("/api/templates/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ channelId }),
                  })
                    .then(() => {
                      setState("success");
                      setTimeout(() => onSuccess?.(), 1500);
                    })
                    .catch(() => {
                      // Template sync failed but channel connected
                      setState("success");
                      setTimeout(() => onSuccess?.(), 1500);
                    });
                } else {
                  setState("success");
                  setTimeout(() => onSuccess?.(), 1500);
                }
              }
            })
            .catch(() => {
              setErrorMessage("Error al conectar con WhatsApp. Intenta de nuevo.");
              setState("error");
              onError?.("Error al conectar con WhatsApp. Intenta de nuevo.");
            });
        } else {
          setErrorMessage("Inicio de sesion cancelado o fallido.");
          setState("error");
          onError?.("Inicio de sesion cancelado o fallido.");
        }
      },
      {
        config_id: process.env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID || "",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
        },
      }
    );
  }, [sdkReady, onSuccess, onError]);

  const handleRetry = useCallback(() => {
    setState("idle");
    setErrorMessage("");
  }, []);

  if (state === "success") {
    return (
      <div className="flex items-center gap-2 w-full justify-center py-2 px-3 rounded-md bg-green-500/10 border border-green-500/30">
        <CheckCircle2 className="h-4 w-4 text-green-400" />
        <span className="text-sm font-medium text-green-400">{stateConfig.success.label}</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col gap-2 w-full">
        <div className="flex items-center gap-2 justify-center py-2 px-3 rounded-md bg-red-500/10 border border-red-500/30">
          <XCircle className="h-4 w-4 text-red-400" />
          <span className="text-xs text-red-400">{errorMessage || stateConfig.error.label}</span>
        </div>
        <Button onClick={handleRetry} variant="outline" className="w-full" size="sm">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Reintentar
        </Button>
      </div>
    );
  }

  const isProcessing = state !== "idle";

  return (
    <Button onClick={handleConnect} disabled={isProcessing} className="w-full">
      {isProcessing ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <MessageSquare className="h-4 w-4 mr-2" />
      )}
      {stateConfig[state].label}
    </Button>
  );
}
