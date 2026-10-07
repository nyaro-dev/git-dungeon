import { z } from "zod";

/**
 * Contrat entre l'ingestion GitHub et le générateur : tout ce que `lib/dungeon`
 * sait d'un repo passe par ce type. Les dates restent des chaînes ISO pour que
 * le générateur n'ait jamais à manipuler `Date`.
 */
export const RepoSnapshotSchema = z.object({
  fullName: z.string().min(3),
  sha: z.string().min(7),
  defaultBranch: z.string(),
  stars: z.number().int().nonnegative(),
  createdAt: z.string(),
  pushedAt: z.string(),
  tree: z
    .array(
      z.object({
        path: z.string(),
        size: z.number().int().nonnegative(),
        type: z.enum(["blob", "tree"]),
      }),
    )
    .max(2000),
  issues: z
    .array(
      z.object({
        number: z.number().int().positive(),
        title: z.string(),
        comments: z.number().int().nonnegative(),
        createdAt: z.string(),
        labels: z.array(z.string()),
      }),
    )
    .max(100),
  commits: z
    .array(
      z.object({
        sha: z.string(),
        message: z.string().max(500),
        date: z.string(),
        author: z.string(),
        files: z.array(z.string()).optional(),
      }),
    )
    .max(100),
  contributors: z
    .array(
      z.object({
        login: z.string(),
        avatarUrl: z.string(),
        contributions: z.number().int().nonnegative(),
      }),
    )
    .max(10),
  languages: z.record(z.string(), z.number().nonnegative()),
  truncated: z.boolean(),
});

export type RepoSnapshot = z.infer<typeof RepoSnapshotSchema>;
