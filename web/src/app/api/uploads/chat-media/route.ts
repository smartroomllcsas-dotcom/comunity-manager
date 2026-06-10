import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";

const MEDIA_BUCKET = "chat-media";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const bundledFfmpegPath = require("ffmpeg-static") as string | null;

async function ensureBucketExists() {
  const admin = createAdminClient();
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw listError;

  const exists = buckets?.some((bucket) => bucket.name === MEDIA_BUCKET);
  if (!exists) {
    const { error: createError } = await admin.storage.createBucket(MEDIA_BUCKET, {
      public: true,
    });
    if (createError && !String(createError.message || "").toLowerCase().includes("already exists")) {
      throw createError;
    }
  }
}

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function getExtension(fileName: string, mimeType: string) {
  return fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : mimeType.split("/").pop();
}

function withoutExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "attachment";
}

function shouldTranscodeAudio(mimeType: string, fileName: string) {
  const ext = getExtension(fileName, mimeType);
  return mimeType.includes("webm") || mimeType.includes("opus") || ext === "webm" || ext === "opus";
}

async function transcodeAudioToM4a(input: Buffer, originalFileName: string) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "communityagent-audio-"));
  const inputPath = path.join(tempDir, sanitizeFileName(originalFileName || "voice.webm"));
  const outputPath = path.join(tempDir, `${sanitizeFileName(withoutExtension(originalFileName || "voice"))}.m4a`);

  try {
    await writeFile(inputPath, input);
    await execFileAsync(bundledFfmpegPath || "ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    return {
      buffer: await readFile(outputPath),
      fileName: `${withoutExtension(originalFileName || "voice")}.m4a`,
      mimeType: "audio/mp4",
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: agent } = await supabase.from("agents").select("*").eq("id", user.id).single();
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  if (!file.type) {
    return NextResponse.json({ error: "El archivo debe tener un tipo MIME válido" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "El archivo supera el límite de 25MB" }, { status: 400 });
  }

  const allowed = [
    "image/",
    "video/",
    "audio/",
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  const mimeType = file.type.toLowerCase();
  const isAllowed = allowed.some((entry) => (entry.endsWith("/") ? mimeType.startsWith(entry) : mimeType === entry));
  if (!isAllowed) {
    return NextResponse.json({ error: "Tipo de archivo no soportado" }, { status: 400 });
  }

  await ensureBucketExists();

  const originalBuffer = Buffer.from(await file.arrayBuffer());
  let uploadBuffer = originalBuffer;
  let uploadFileName = file.name || "attachment";
  let uploadMimeType = mimeType;

  if (mimeType.startsWith("audio/") && shouldTranscodeAudio(mimeType, uploadFileName)) {
    try {
      const converted = await transcodeAudioToM4a(originalBuffer, uploadFileName);
      uploadBuffer = converted.buffer;
      uploadFileName = converted.fileName;
      uploadMimeType = converted.mimeType;
    } catch (error) {
      console.error("[uploads] audio transcode failed", error);
      return NextResponse.json(
        { error: "No se pudo convertir el audio a un formato compatible con Instagram" },
        { status: 500 }
      );
    }
  }

  const ext = getExtension(uploadFileName, uploadMimeType);
  const storagePath = `${agent.organization_id}/${user.id}/${Date.now()}-${sanitizeFileName(uploadFileName)}`;

  const { error: uploadError } = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, uploadBuffer, {
      contentType: uploadMimeType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
  return NextResponse.json({
    url: data.publicUrl,
    path: storagePath,
    fileName: uploadFileName,
    mimeType: uploadMimeType,
    ext,
    bucket: MEDIA_BUCKET,
  });
}
