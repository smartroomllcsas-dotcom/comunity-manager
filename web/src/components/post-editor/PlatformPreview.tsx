"use client";

// Sprint 24 · Mockups visuales realistas por plataforma.
// Cada preview respeta el límite de caracteres, renderiza hashtags/@mentions
// como enlaces azules, y muestra media cuando aplica.
// El look emula la UI real (feed, reel, story, tiktok, linkedin, x, threads).

import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Repeat2,
  BarChart2,
  ThumbsUp,
  Share2,
  Music2,
  ChevronUp,
  Play,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Platform } from "./platforms";
import { PLATFORM_META } from "./platforms";

// -- helpers ------------------------------------------------------------------

/** Rompe el texto en tokens: palabras, hashtags, menciones, enlaces. */
function renderRichText(text: string) {
  // Split conservando delimitadores. Regex captura #tag, @user, http(s)://url
  const parts = text.split(/(\s+|#[\p{L}0-9_]+|@[\p{L}0-9_.]+|https?:\/\/\S+)/gu);
  return parts.map((chunk, i) => {
    if (!chunk) return null;
    if (chunk.startsWith("#") || chunk.startsWith("@")) {
      return (
        <span key={i} className="text-[#3b82f6] hover:underline cursor-pointer">
          {chunk}
        </span>
      );
    }
    if (/^https?:\/\//.test(chunk)) {
      return (
        <span key={i} className="text-[#3b82f6] hover:underline cursor-pointer break-all">
          {chunk}
        </span>
      );
    }
    return <span key={i}>{chunk}</span>;
  });
}

/** Corta el texto en el limite de la plataforma, mostrando el corte. */
function truncateForPlatform(text: string, limit: number) {
  if (text.length <= limit) return { visible: text, cut: "" };
  return { visible: text.slice(0, limit), cut: text.slice(limit) };
}

function MediaBox({
  urls,
  aspect,
  className,
}: {
  urls?: string[];
  aspect: "1:1" | "9:16" | "16:9" | "4:5";
  className?: string;
}) {
  const first = urls?.[0];
  const aspectClass =
    aspect === "1:1"
      ? "aspect-square"
      : aspect === "9:16"
        ? "aspect-[9/16]"
        : aspect === "16:9"
          ? "aspect-video"
          : "aspect-[4/5]";
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-md bg-gradient-to-br from-[#1a1f2e] to-[#0d1117] flex items-center justify-center text-[#7d8590] text-xs",
        aspectClass,
        className,
      )}
    >
      {first ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first} alt="media" className="w-full h-full object-cover" />
      ) : (
        <span className="opacity-60">sin media</span>
      )}
    </div>
  );
}

function Avatar({ label = "CM", size = 32 }: { label?: string; size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center text-white text-xs font-semibold shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}

function CharBudget({ text, limit }: { text: string; limit: number }) {
  const over = text.length > limit;
  return (
    <div className={cn("text-xs mt-1", over ? "text-[#f85149]" : "text-[#7d8590]")}>
      {text.length}/{limit}
      {over && " · se cortará al publicar"}
    </div>
  );
}

// -- Preview cards ------------------------------------------------------------

function FacebookCard({ content, media }: { content: string; media?: string[] }) {
  const limit = PLATFORM_META.fb.limit;
  const { visible, cut } = truncateForPlatform(content, limit);
  return (
    <div className="rounded-lg bg-[#161b22] border border-[#2d333b] p-4 max-w-md mx-auto">
      <div className="flex items-start gap-2">
        <Avatar label="CM" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#e6edf3]">Community Manager</div>
          <div className="text-xs text-[#7d8590]">Hace un momento · <span aria-hidden>🌐</span></div>
        </div>
        <MoreHorizontal className="size-4 text-[#7d8590]" />
      </div>
      <div className="mt-3 text-sm text-[#e6edf3] whitespace-pre-wrap break-words">
        {renderRichText(visible)}
        {cut && <span className="text-[#7d8590]"> … Ver más</span>}
      </div>
      {media && media.length > 0 && (
        <div className="mt-3">
          <MediaBox urls={media} aspect="16:9" />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-[#7d8590]">
        <div className="flex items-center gap-1"><ThumbsUp className="size-3" /> Me gusta</div>
        <div className="flex items-center gap-1"><MessageCircle className="size-3" /> Comentar</div>
        <div className="flex items-center gap-1"><Share2 className="size-3" /> Compartir</div>
      </div>
      <CharBudget text={content} limit={limit} />
    </div>
  );
}

function InstagramFeedCard({ content, media }: { content: string; media?: string[] }) {
  const limit = PLATFORM_META["ig-feed"].limit;
  const { visible, cut } = truncateForPlatform(content, limit);
  const caption = visible.length > 125 ? visible.slice(0, 125) : visible;
  const remaining = visible.slice(caption.length);
  return (
    <div className="rounded-lg bg-[#161b22] border border-[#2d333b] max-w-md mx-auto overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <Avatar label="CM" size={28} />
        <div className="text-sm font-semibold text-[#e6edf3]">community.mgr</div>
        <MoreHorizontal className="size-4 text-[#7d8590] ml-auto" />
      </div>
      <MediaBox urls={media} aspect="1:1" className="rounded-none" />
      <div className="p-3">
        <div className="flex items-center gap-3 text-[#e6edf3]">
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <Send className="size-5" />
          <Bookmark className="size-5 ml-auto" />
        </div>
        <div className="mt-2 text-sm text-[#e6edf3] whitespace-pre-wrap break-words">
          <span className="font-semibold">community.mgr</span>{" "}
          {renderRichText(caption)}
          {remaining && <span className="text-[#7d8590]"> … más</span>}
        </div>
        {cut && (
          <div className="mt-1 text-xs text-[#f85149]">
            se cortará al publicar (excede {limit} chars)
          </div>
        )}
        <div className="mt-1 text-xs text-[#7d8590]">Ver los 12 comentarios</div>
        <CharBudget text={content} limit={limit} />
      </div>
    </div>
  );
}

function InstagramReelCard({ content, media }: { content: string; media?: string[] }) {
  const limit = PLATFORM_META["ig-reel"].limit;
  const { visible } = truncateForPlatform(content, limit);
  return (
    <div className="relative mx-auto max-w-[280px] rounded-2xl overflow-hidden border border-[#2d333b] bg-black">
      <MediaBox urls={media} aspect="9:16" className="rounded-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
      <div className="absolute right-2 bottom-16 flex flex-col gap-4 items-center text-white">
        <Heart className="size-6" />
        <MessageCircle className="size-6" />
        <Send className="size-6" />
        <Bookmark className="size-6" />
        <MoreHorizontal className="size-6" />
      </div>
      <div className="absolute left-3 right-16 bottom-3 text-white">
        <div className="flex items-center gap-2">
          <Avatar label="CM" size={24} />
          <span className="text-sm font-semibold">community.mgr</span>
          <span className="text-xs border border-white/60 rounded px-1.5">Seguir</span>
        </div>
        <div className="mt-2 text-xs whitespace-pre-wrap break-words line-clamp-3">
          {renderRichText(visible)}
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs opacity-90">
          <Music2 className="size-3" /> Sonido original
        </div>
      </div>
      <div className="p-2 bg-[#161b22]">
        <CharBudget text={content} limit={limit} />
      </div>
    </div>
  );
}

function InstagramStoryCard({ content, media }: { content: string; media?: string[] }) {
  return (
    <div className="relative mx-auto max-w-[280px] rounded-2xl overflow-hidden border border-[#2d333b] bg-black">
      <div className="absolute top-2 left-2 right-2 h-0.5 bg-white/40 rounded-full z-10">
        <div className="h-full w-1/3 bg-white rounded-full" />
      </div>
      <div className="absolute top-4 left-3 right-3 z-10 flex items-center gap-2 text-white">
        <Avatar label="CM" size={24} />
        <span className="text-xs font-semibold">community.mgr</span>
        <span className="text-xs opacity-80">ahora</span>
      </div>
      <MediaBox urls={media} aspect="9:16" className="rounded-none" />
      <div className="absolute inset-x-0 bottom-8 text-center text-white text-xs opacity-90">
        <ChevronUp className="size-4 inline-block" /> Ver más
      </div>
      <div className="p-2 bg-[#161b22]">
        <div className="text-xs text-[#7d8590]">Stories no muestran caption. El texto se ignora.</div>
      </div>
    </div>
  );
}

function TikTokCard({ content, media }: { content: string; media?: string[] }) {
  const limit = PLATFORM_META.tiktok.limit;
  const { visible, cut } = truncateForPlatform(content, limit);
  return (
    <div className="relative mx-auto max-w-[280px] rounded-2xl overflow-hidden border border-[#2d333b] bg-black">
      <MediaBox urls={media} aspect="9:16" className="rounded-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute right-2 bottom-16 flex flex-col gap-4 items-center text-white">
        <div className="relative">
          <Avatar label="CM" size={36} />
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-[#fe2c55] rounded-full p-0.5">
            <UserPlus className="size-3 text-white" />
          </div>
        </div>
        <div className="flex flex-col items-center"><Heart className="size-7" /><span className="text-xs">12.3K</span></div>
        <div className="flex flex-col items-center"><MessageCircle className="size-7" /><span className="text-xs">248</span></div>
        <div className="flex flex-col items-center"><Bookmark className="size-7" /><span className="text-xs">Guardar</span></div>
        <div className="flex flex-col items-center"><Share2 className="size-7" /><span className="text-xs">Compartir</span></div>
        <div className="mt-2 rounded-full border border-white p-1">
          <Music2 className="size-4 animate-spin-slow" />
        </div>
      </div>
      <div className="absolute left-3 right-16 bottom-3 text-white">
        <div className="text-sm font-semibold">@community.mgr</div>
        <div className="mt-1 text-xs whitespace-pre-wrap break-words line-clamp-3">
          {renderRichText(visible)}
          {cut && <span className="opacity-70"> …</span>}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs opacity-90">
          <Music2 className="size-3" /> sonido original · community.mgr
        </div>
      </div>
      <div className="p-2 bg-[#161b22]">
        <CharBudget text={content} limit={limit} />
      </div>
    </div>
  );
}

function LinkedInCard({
  content,
  media,
  company,
}: {
  content: string;
  media?: string[];
  company?: boolean;
}) {
  const limit = PLATFORM_META[company ? "linkedin-company" : "linkedin-personal"].limit;
  const { visible, cut } = truncateForPlatform(content, limit);
  const seeMoreThreshold = 250;
  const showSeeMore = visible.length > seeMoreThreshold;
  const shown = showSeeMore ? visible.slice(0, seeMoreThreshold) : visible;
  return (
    <div className="rounded-lg bg-[#161b22] border border-[#2d333b] p-4 max-w-md mx-auto">
      <div className="flex items-start gap-2">
        <Avatar label="CM" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#e6edf3]">
            {company ? "Community Manager Inc." : "Community Manager"}
          </div>
          <div className="text-xs text-[#7d8590]">
            {company ? "Marketing & Advertising · 2.4K seguidores" : "Community Manager · 1er"}
          </div>
          <div className="text-xs text-[#7d8590]">Ahora · <span aria-hidden>🌐</span></div>
        </div>
        <MoreHorizontal className="size-4 text-[#7d8590]" />
      </div>
      <div className="mt-3 text-sm text-[#e6edf3] whitespace-pre-wrap break-words">
        {renderRichText(shown)}
        {showSeeMore && (
          <span className="text-[#7d8590] cursor-pointer hover:underline"> … ver más</span>
        )}
      </div>
      {media && media.length > 0 && (
        <div className="mt-3">
          <MediaBox urls={media} aspect="4:5" />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-[#7d8590]">
        <div className="flex items-center gap-1"><ThumbsUp className="size-3" /> Recomendar</div>
        <div className="flex items-center gap-1"><MessageCircle className="size-3" /> Comentar</div>
        <div className="flex items-center gap-1"><Repeat2 className="size-3" /> Republicar</div>
        <div className="flex items-center gap-1"><Send className="size-3" /> Enviar</div>
      </div>
      {cut && <div className="mt-2 text-xs text-[#f85149]">se cortará al publicar (excede {limit} chars)</div>}
      <CharBudget text={content} limit={limit} />
    </div>
  );
}

function XCard({ content, media }: { content: string; media?: string[] }) {
  const limit = PLATFORM_META.x.limit;
  const { visible, cut } = truncateForPlatform(content, limit);
  return (
    <div className="rounded-lg bg-[#161b22] border border-[#2d333b] p-4 max-w-md mx-auto">
      <div className="flex items-start gap-2">
        <Avatar label="CM" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-[#e6edf3]">Community Manager</span>
            <span className="text-[#7d8590]">@community_mgr · 1m</span>
          </div>
          <div className="mt-1 text-sm text-[#e6edf3] whitespace-pre-wrap break-words">
            {renderRichText(visible)}
            {cut && <span className="text-[#f85149]">… (cortado)</span>}
          </div>
          {media && media.length > 0 && (
            <div className="mt-3">
              <MediaBox urls={media} aspect="16:9" />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-xs text-[#7d8590] max-w-xs">
            <div className="flex items-center gap-1"><MessageCircle className="size-3.5" /> 12</div>
            <div className="flex items-center gap-1"><Repeat2 className="size-3.5" /> 5</div>
            <div className="flex items-center gap-1"><Heart className="size-3.5" /> 84</div>
            <div className="flex items-center gap-1"><BarChart2 className="size-3.5" /> 2.1K</div>
            <div className="flex items-center gap-1"><Share2 className="size-3.5" /></div>
          </div>
          <CharBudget text={content} limit={limit} />
        </div>
      </div>
    </div>
  );
}

function ThreadsCard({ content, media }: { content: string; media?: string[] }) {
  const limit = PLATFORM_META.threads.limit;
  const { visible, cut } = truncateForPlatform(content, limit);
  return (
    <div className="rounded-lg bg-[#0a0a0a] border border-[#2d333b] p-4 max-w-md mx-auto">
      <div className="flex items-start gap-3">
        <Avatar label="CM" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-white">community.mgr</span>
            <span className="text-[#7d8590] text-xs">1m</span>
            <MoreHorizontal className="size-4 text-[#7d8590] ml-auto" />
          </div>
          <div className="mt-1 text-sm text-white whitespace-pre-wrap break-words">
            {renderRichText(visible)}
            {cut && <span className="text-[#f85149]"> …</span>}
          </div>
          {media && media.length > 0 && (
            <div className="mt-3">
              <MediaBox urls={media} aspect="4:5" />
            </div>
          )}
          <div className="mt-3 flex items-center gap-4 text-[#7d8590]">
            <Heart className="size-4" />
            <MessageCircle className="size-4" />
            <Repeat2 className="size-4" />
            <Send className="size-4" />
          </div>
          <div className="mt-1 text-xs text-[#7d8590]">12 respuestas · 84 me gusta</div>
          <CharBudget text={content} limit={limit} />
        </div>
      </div>
    </div>
  );
}

// -- Public API ---------------------------------------------------------------

export function PlatformPreview({
  platforms,
  content,
  media,
}: {
  platforms: Platform[];
  content: string;
  media?: string[];
}) {
  if (platforms.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#2d333b] bg-[#0d1117] p-8 text-center text-sm text-[#7d8590]">
        <Play className="size-6 mx-auto mb-2 opacity-50" />
        Selecciona al menos un canal para ver el preview.
      </div>
    );
  }

  return (
    <Tabs defaultValue={platforms[0]} className="w-full">
      <TabsList className="flex flex-wrap h-auto">
        {platforms.map((p) => (
          <TabsTrigger key={p} value={p} className="capitalize">
            {PLATFORM_META[p].label}
          </TabsTrigger>
        ))}
      </TabsList>
      {platforms.map((p) => (
        <TabsContent key={p} value={p} className="mt-4">
          {p === "fb" && <FacebookCard content={content} media={media} />}
          {p === "ig-feed" && <InstagramFeedCard content={content} media={media} />}
          {p === "ig-reel" && <InstagramReelCard content={content} media={media} />}
          {p === "ig-story" && <InstagramStoryCard content={content} media={media} />}
          {p === "tiktok" && <TikTokCard content={content} media={media} />}
          {p === "linkedin-personal" && <LinkedInCard content={content} media={media} />}
          {p === "linkedin-company" && <LinkedInCard content={content} media={media} company />}
          {p === "x" && <XCard content={content} media={media} />}
          {p === "threads" && <ThreadsCard content={content} media={media} />}
        </TabsContent>
      ))}
    </Tabs>
  );
}
