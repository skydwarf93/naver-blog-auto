import { z } from "zod";

export const SectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().min(1) }),
  z.object({ type: z.literal("paragraph"), text: z.string().min(1), highlight: z.string().optional().nullable() }),
  z.object({ type: z.literal("quote"), text: z.string().min(1) }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("image"), query: z.string().min(1), caption: z.string().optional().nullable() }),
]);
export type Section = z.infer<typeof SectionSchema>;

export const DraftBaseSchema = z.object({
  title: z.string().min(4),
  sections: z.array(SectionSchema).min(4),
});
export type Draft = z.infer<typeof DraftBaseSchema>;

export type PhotoSource = "none" | "local" | "crawl" | "ai";
export type ImageStyle = "photo" | "illust";
export type JobMode = "auto" | "review" | "branding";

const countImages = (d: Draft) => d.sections.filter((s) => s.type === "image").length;

/** ⚠️ 이미지 개수 조건은 사진 소스별로 다르다. local 에 6개를 강제하면 사진이 4장뿐일 때 영원히 실패한다 */
export function draftSchemaFor(photoSource: PhotoSource, localCount = 0) {
  if (photoSource === "none") return DraftBaseSchema.refine((d) => countImages(d) === 0, { message: "image 섹션을 만들지 마라(0개여야 함)" });
  if (photoSource === "local") return DraftBaseSchema.refine((d) => countImages(d) === localCount, { message: `image 섹션은 정확히 ${localCount}개여야 한다` });
  return DraftBaseSchema.refine((d) => countImages(d) >= 6, { message: "image 섹션이 6개 이상이어야 한다" });
}

export const IdeasSchema = z.array(z.object({ title: z.string(), angle: z.string(), rationale: z.string() })).min(1);
export type Idea = z.infer<typeof IdeasSchema>[number];

export const VisionVerdictSchema = z.object({
  fit: z.boolean(),
  watermark: z.boolean(),
  koreanPerson: z.boolean(),
  reason: z.string(),
});
export type VisionVerdict = z.infer<typeof VisionVerdictSchema>;

export const GenVerdictSchema = z.object({
  ok: z.boolean(),
  problem: z.enum(["none", "off_topic", "broken_shape", "text_in_image", "low_quality"]),
  reason: z.string(),
});

export const JobInputSchema = z.object({
  mode: z.enum(["auto", "review", "branding"]),
  keyword: z.string().trim().min(1).max(100),
  details: z.string().max(4000).optional().default(""),
  photoSource: z.enum(["none", "local", "crawl", "ai"]),
  imageStyle: z.enum(["photo", "illust"]).optional().default("photo"),
  photoDir: z.string().optional().default(""),
  placement: z.enum(["order", "ai"]).optional().default("order"),
});
export type JobInput = z.infer<typeof JobInputSchema>;

export interface Source { type: "news" | "blog"; title: string; summary: string; url: string }
