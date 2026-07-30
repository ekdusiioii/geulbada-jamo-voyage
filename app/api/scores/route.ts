const SCORE_STORE_URL =
  "https://geulbada-jamo-voyage.eunhwa10.chatgpt.site/api/scores";

async function forwardScoreRequest(request: Request) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(SCORE_STORE_URL);
  upstreamUrl.search = incomingUrl.search;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers:
        request.method === "POST"
          ? { "Content-Type": "application/json" }
          : undefined,
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          upstream.headers.get("Content-Type") ??
          "application/json; charset=utf-8",
      },
    });
  } catch {
    return Response.json(
      { error: "점수 기록소에 잠시 연결할 수 없어요." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const dynamic = "force-dynamic";
export const GET = forwardScoreRequest;
export const POST = forwardScoreRequest;
