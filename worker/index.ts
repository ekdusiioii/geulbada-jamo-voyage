/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type ScoreRow = {
  nickname: string;
  best_score: number;
  updated_at: number;
};

let scoreSchemaReady: Promise<unknown> | null = null;

function ensureScoreSchema(db: D1Database): Promise<unknown> {
  scoreSchemaReady ??= db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS player_scores (
        nickname TEXT PRIMARY KEY,
        best_score INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS player_scores_ranking_idx
      ON player_scores (best_score DESC, updated_at ASC)
    `),
  ]);
  return scoreSchemaReady;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nickname = value.trim().replace(/\s+/g, " ");
  const length = Array.from(nickname).length;
  if (length < 1 || length > 12) return null;
  if (!/^[\p{L}\p{N}_ -]+$/u.test(nickname)) return null;
  return nickname;
}

async function handleScores(request: Request, env: Env): Promise<Response> {
  await ensureScoreSchema(env.DB);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const nickname = normalizeNickname(url.searchParams.get("nickname"));
    const leaders = await env.DB.prepare(`
      SELECT nickname, best_score, updated_at
      FROM player_scores
      ORDER BY best_score DESC, updated_at ASC
      LIMIT 5
    `).all<ScoreRow>();
    const player = nickname
      ? await env.DB.prepare(`
          SELECT nickname, best_score, updated_at
          FROM player_scores
          WHERE nickname = ?
        `).bind(nickname).first<ScoreRow>()
      : null;
    return json({ player, leaders: leaders.results ?? [] });
  }

  if (request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "올바른 요청이 아니에요." }, 400);
    }
    const data = body as { nickname?: unknown; score?: unknown };
    const nickname = normalizeNickname(data.nickname);
    const score = Number(data.score);
    if (!nickname || !Number.isInteger(score) || score < 0 || score > 10_000_000) {
      return json({ error: "닉네임이나 점수를 다시 확인해 주세요." }, 400);
    }

    const updatedAt = Date.now();
    await env.DB.prepare(`
      INSERT INTO player_scores (nickname, best_score, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(nickname) DO UPDATE SET
        best_score = MAX(player_scores.best_score, excluded.best_score),
        updated_at = excluded.updated_at
    `).bind(nickname, score, updatedAt).run();

    const player = await env.DB.prepare(`
      SELECT nickname, best_score, updated_at
      FROM player_scores
      WHERE nickname = ?
    `).bind(nickname).first<ScoreRow>();
    const leaders = await env.DB.prepare(`
      SELECT nickname, best_score, updated_at
      FROM player_scores
      ORDER BY best_score DESC, updated_at ASC
      LIMIT 5
    `).all<ScoreRow>();
    return json({ player, leaders: leaders.results ?? [] });
  }

  return json({ error: "지원하지 않는 요청이에요." }, 405);
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/scores") {
      return handleScores(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
