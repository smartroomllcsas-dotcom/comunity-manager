import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { execFile } from "child_process";
import { constants } from "fs";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import { fileTypeFromBuffer } from "file-type";

const MEDIA_BUCKET = "chat-media";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
// TTL para signed URLs. 30 días cubre la vida útil típica de un mensaje en el inbox;
// para historial antiguo, se re-firma bajo demanda vía /api/uploads/chat-media/signed.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const bundledFfmpegPath = require("ffmpeg-static") as string | null;

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

async function canExecute(filePath: string) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    try {
      await access(filePath, constants.F_OK);
      await chmod(filePath, 0o755);
      await access(filePath, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
}

async function resolveFfmpegPath() {
  let packageDir: string | undefined;
  try {
    packageDir = path.dirname(require.resolve("ffmpeg-static/package.json"));
  } catch {
    packageDir = undefined;
  }

  const candidates = uniqueValues([
    bundledFfmpegPath,
    packageDir ? path.join(packageDir, "ffmpeg") : undefined,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(process.cwd(), ".next", "standalone", "node_modules", "ffmpeg-static", "ffmpeg"),
    "/var/task/node_modules/ffmpeg-static/ffmpeg",
    "/var/task/.next/standalone/node_modules/ffmpeg-static/ffmpeg",
  ]);

  for (const candidate of candidates) {
    if (await canExecute(candidate)) return candidate;
  }

  // Last fallback for environments where ffmpeg is available on PATH.
  return "ffmpeg";
}

async function ensureBucketExists() {
  const admin = createAdminClient();
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw listError;

  const existing = buckets?.find((bucket) => bucket.name === MEDIA_BUCKET);
  if (!existing) {
    const { error: createError } = await admin.storage.createBucket(MEDIA_BUCKET, {
      public: false,
    });
    if (createError && !String(createError.message || "").toLowerCase().includes("already exists")) {
      throw createError;
    }
    return;
  }

  if (existing.public) {
    // Bucket legacy creado como público. Solo lo señalamos; el flip a privado
    // debe hacerse manualmente para no invalidar URLs ya guardadas en mensajes.
    console.warn(`[uploads] bucket ${MEDIA_BUCKET} sigue como público (legacy); considera updateBucket public:false y re-firmar URLs históricas.`);
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
    const ffmpegPath = await resolveFfmpegPath();
    await writeFile(inputPath, input);
    await execFileAsync(ffmpegPath, [
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

  // Validación magic-bytes: rechaza un HTML/SVG etiquetado como image/png en el form.
  // Tipos "text/*" no tienen firma; los aceptamos siempre que el mime declarado esté en el allowlist.
  const detected = await fileTypeFromBuffer(originalBuffer);
  if (detected) {
    const detectedMime = detected.mime.toLowerCase();
    const declaredIsPrefix = allowed.find((entry) => entry.endsWith("/") && mimeType.startsWith(entry));
    if (declaredIsPrefix) {
      const declaredPrefix = declaredIsPrefix.slice(0, -1);
      if (!detectedMime.startsWith(`${declaredPrefix}/`)) {
        return NextResponse.json(
          { error: `El archivo no coincide con el tipo declarado (declarado ${mimeType}, real ${detectedMime})` },
          { status: 400 }
        );
      }
    } else if (detectedMime !== mimeType) {
      return NextResponse.json(
        { error: `El archivo no coincide con el tipo declarado (declarado ${mimeType}, real ${detectedMime})` },
        { status: 400 }
      );
    }
  } else if (!mimeType.startsWith("text/") && mimeType !== "application/pdf" && !mimeType.startsWith("application/vnd")) {
    // Archivos sin firma binaria conocida (que además no son texto/office) son sospechosos.
    return NextResponse.json({ error: "No se pudo verificar el tipo del archivo" }, { status: 400 });
  }

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

  const { data: signed, error: signError } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message || "No se pudo firmar la URL del archivo" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    path: storagePath,
    fileName: uploadFileName,
    mimeType: uploadMimeType,
    ext: ext ?? "",
    bucket: MEDIA_BUCKET,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}
