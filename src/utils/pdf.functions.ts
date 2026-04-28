import { createServerFn } from "@tanstack/react-start";

type PdfSummary = {
  kind: "pdf";
  pages: number;
  info: Record<string, string>;
  pageSizes: { page: number; width: number; height: number }[];
  totalChars: number;
  textSnippet: string;
  textByPage: { page: number; chars: number; preview: string }[];
};

async function parsePdf(bytes: Uint8Array): Promise<PdfSummary> {
  // Use legacy build for server-side (no DOM). Disable worker.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  const meta = await doc.getMetadata().catch(() => ({ info: {} }));
  const info: Record<string, string> = {};
  if (meta?.info && typeof meta.info === "object") {
    for (const [k, v] of Object.entries(meta.info as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) info[k] = v.slice(0, 300);
    }
  }

  const pageSizes: PdfSummary["pageSizes"] = [];
  const textByPage: PdfSummary["textByPage"] = [];
  let allText = "";

  const maxPages = Math.min(doc.numPages, 30);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    pageSizes.push({
      page: i,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    });
    const tc = await page.getTextContent();
    const pageText = (tc.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    textByPage.push({
      page: i,
      chars: pageText.length,
      preview: pageText.slice(0, 400),
    });
    allText += (allText ? "\n\n" : "") + `[p${i}] ` + pageText;
  }

  return {
    kind: "pdf",
    pages: doc.numPages,
    info,
    pageSizes,
    totalChars: allText.length,
    textSnippet: allText.slice(0, 8000),
    textByPage,
  };
}

function buildPrompt(filename: string, s: PdfSummary): string {
  return `Você é um engenheiro projetista analisando um arquivo PDF exportado de software CAD ou de um documento técnico de engenharia.
Gere uma DESCRIÇÃO TÉCNICA em português, em linguagem natural fluida.

Estruture em seções markdown:
## Visão Geral
## Conteúdo por Página
## Elementos Técnicos Identificados
## Anotações e Texto
## Observações Técnicas

Seja preciso: cite número de páginas, dimensões das folhas (em pontos PDF: 72pt = 1in), formato (A4/A3/A1 etc. quando reconhecível), e infira o propósito (planta baixa, corte, detalhe, memorial, lista de materiais, esquema elétrico, ART, capa, etc.) a partir do texto extraído. Não invente dados ausentes.

Formatos usuais (pt): A4 595×842, A3 842×1191, A2 1191×1684, A1 1684×2384, A0 2384×3370.

Arquivo: ${filename}

Metadados:
- Páginas: ${s.pages}
- Info do documento: ${JSON.stringify(s.info)}
- Tamanhos (pt): ${JSON.stringify(s.pageSizes)}
- Total de caracteres de texto extraído: ${s.totalChars}
- Texto por página (preview): ${JSON.stringify(s.textByPage)}

Texto extraído (truncado):
"""
${s.textSnippet}
"""`;
}

async function callAi(prompt: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { description: null as string | null, error: "LOVABLE_API_KEY não configurada" };

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um engenheiro projetista especialista em análise de documentos e desenhos técnicos." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      if (resp.status === 429) return { description: null, error: "Limite de requisições excedido. Tente novamente em instantes." };
      if (resp.status === 402) return { description: null, error: "Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage." };
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return { description: null, error: `Erro da IA (${resp.status})` };
    }
    const json = await resp.json();
    return { description: (json.choices?.[0]?.message?.content ?? null) as string | null, error: null as string | null };
  } catch (e) {
    console.error("callAi failed:", e);
    return { description: null, error: e instanceof Error ? e.message : "Falha desconhecida" };
  }
}

export const analyzePdf = createServerFn({ method: "POST" })
  .inputValidator((data: { filename: string; base64: string }) => {
    if (!data?.base64 || typeof data.base64 !== "string") throw new Error("Conteúdo PDF ausente");
    return data;
  })
  .handler(async ({ data }) => {
    // Decode base64 → Uint8Array
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length > 20 * 1024 * 1024) throw new Error("Arquivo muito grande (máx 20MB)");

    let summary: PdfSummary;
    try {
      summary = await parsePdf(bytes);
    } catch (e) {
      console.error("parsePdf failed:", e);
      return { summary: null, description: null, error: "Não foi possível ler o PDF (pode estar protegido ou corrompido)." };
    }

    const ai = await callAi(buildPrompt(data.filename, summary));
    return { summary, description: ai.description, error: ai.error };
  });
