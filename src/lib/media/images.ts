import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import type { ImageAsset } from "@/lib/domain/types";
import { VARIANT_WIDTHS } from "@/lib/images/loader";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp", "avif", "heif", "gif", "tiff"]);
export const LOCAL_MEDIA_DIR = path.join(process.cwd(), ".data", "media");

export type ProcessedImage = {
  width: number;
  height: number;
  blur: string;
  variants: { width: number; data: Buffer }[];
};

export class ImageError extends Error {}

/**
 * Auto-orients, strips metadata (EXIF/GPS) and renders every width the image loader may ask for
 * (smaller originals are not upscaled, the larger variant names simply hold the original size).
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const { default: sharp } = await import("sharp");
  const base = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
  let meta;
  try {
    meta = await base.metadata();
  } catch {
    throw new ImageError("Файл не похож на изображение");
  }
  if (!meta.format || !ACCEPTED.has(meta.format))
    throw new ImageError("Поддерживаются JPEG, PNG, WebP, AVIF");
  const variants: ProcessedImage["variants"] = [];
  let largest = { width: 0, height: 0 };
  for (const w of VARIANT_WIDTHS) {
    const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 76, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    variants.push({ width: w, data });
    if (info.width >= largest.width) largest = { width: info.width, height: info.height };
  }
  const blurBuf = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 16 })
    .webp({ quality: 40 })
    .toBuffer();
  return {
    width: largest.width,
    height: largest.height,
    blur: `data:image/webp;base64,${blurBuf.toString("base64")}`,
    variants,
  };
}

export function storageConfigured() {
  const e = env();
  return Boolean(
    e.S3_ENDPOINT && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY && e.S3_PUBLIC_URL,
  );
}

const IMMUTABLE = "public, max-age=31536000, immutable";

/** Uploads all variants under `<folder>/<name>-<rand>-<w>.webp`; returns the asset for the item. */
export async function storeImage(
  img: ProcessedImage,
  folder: "menu" | "promo",
  name: string,
): Promise<ImageAsset> {
  const safe =
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 32) || "img";
  const key = `${folder}/${safe}-${randomBytes(5).toString("hex")}`;
  const e = env();
  if (storageConfigured()) {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
    });
    await Promise.all(
      img.variants.map((v) =>
        client.send(
          new PutObjectCommand({
            Bucket: e.S3_BUCKET,
            Key: `${key}-${v.width}.webp`,
            Body: v.data,
            ContentType: "image/webp",
            CacheControl: IMMUTABLE,
          }),
        ),
      ),
    );
    return {
      src: `${e.S3_PUBLIC_URL!.replace(/\/+$/, "")}/${key}`,
      width: img.width,
      height: img.height,
      blur: img.blur,
      variants: true,
    };
  }
  const dir = path.join(LOCAL_MEDIA_DIR, folder);
  await mkdir(dir, { recursive: true });
  await Promise.all(
    img.variants.map((v) =>
      writeFile(path.join(LOCAL_MEDIA_DIR, `${key}-${v.width}.webp`), v.data),
    ),
  );
  return {
    src: `/media/${key}`,
    width: img.width,
    height: img.height,
    blur: img.blur,
    variants: true,
  };
}
