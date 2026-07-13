"use client";

const EMOJI_PICKER = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎",
  "🤝", "🙏", "👏", "🎉", "💪", "🔥", "💡", "✅",
  "❤️", "💙", "💜", "🫶", "👍", "👀", "🥳", "😅",
];

const STICKER_PICKER = [
  "😺", "🤖", "🌟", "🔥", "💥", "🎉", "❤️", "👍",
];

export function emojiToTwemojiUrl(emoji: string) {
  const codePoints = Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-");
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codePoints}.png`;
}

export function emojiToStickerFilename(emoji: string) {
  return `sticker-${Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-")}.png`;
}

export function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="mt-2 grid grid-cols-8 gap-1 rounded-lg border border-[#2d333b] bg-[#0d1117] p-2 max-w-[360px]">
      {EMOJI_PICKER.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="h-8 w-8 rounded-md hover:bg-[#1a1f2e] text-lg flex items-center justify-center"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function StickerGrid({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-2 rounded-lg border border-[#2d333b] bg-[#0d1117] p-2 max-w-[360px]">
      {STICKER_PICKER.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="h-16 rounded-md bg-[#161b22] border border-[#2d333b] hover:border-[#388bfd] flex items-center justify-center p-2"
          title="Enviar sticker"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={emojiToTwemojiUrl(emoji)}
            alt={`Sticker ${emoji}`}
            className="h-10 w-10 object-contain"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}
