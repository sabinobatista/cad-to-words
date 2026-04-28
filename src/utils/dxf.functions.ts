import { createServerFn } from "@tanstack/react-start";

type DxfSummary = {
  entityCounts: Record<string, number>;
  totalEntities: number;
  layers: { name: string; count: number }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null;
  units: string;
  textSamples: string[];
  dimensions: number;
  blocks: string[];
};

function parseDxf(content: string): DxfSummary {
  // DXF: pairs of (groupCode, value) separated by newlines
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const pairs: { code: number; value: string }[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i], 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: lines[i + 1] ?? "" });
  }

  const entityCounts: Record<string, number> = {};
  const layerCounts: Record<string, number> = {};
  const textSamples: string[] = [];
  const blocks = new Set<string>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let units = "unitless";

  // Section tracking
  let section = "";
  let currentEntity: { type: string; layer?: string } | null = null;
  let inBlocks = false;
  let inHeader = false;
  let headerVar = "";

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i];

    if (code === 0) {
      if (value === "SECTION") {
        const next = pairs[i + 1];
        if (next && next.code === 2) {
          section = next.value;
          inBlocks = section === "BLOCKS";
          inHeader = section === "HEADER";
        }
        continue;
      }
      if (value === "ENDSEC") {
        section = "";
        inBlocks = false;
        inHeader = false;
        currentEntity = null;
        continue;
      }

      if (section === "ENTITIES" || inBlocks) {
        if (value !== "ENDBLK" && value !== "BLOCK") {
          currentEntity = { type: value };
          entityCounts[value] = (entityCounts[value] || 0) + 1;
        } else if (value === "BLOCK") {
          currentEntity = { type: "BLOCK" };
        }
      }
      continue;
    }

    if (inHeader) {
      if (code === 9) headerVar = value;
      if (headerVar === "$INSUNITS" && code === 70) {
        const map: Record<string, string> = {
          "0": "unitless", "1": "inches", "2": "feet", "4": "millimeters",
          "5": "centimeters", "6": "meters",
        };
        units = map[value] ?? "unitless";
      }
      continue;
    }

    if (inBlocks && currentEntity?.type === "BLOCK" && code === 2) {
      blocks.add(value);
    }

    if (section === "ENTITIES" && currentEntity) {
      if (code === 8) {
        currentEntity.layer = value;
        layerCounts[value] = (layerCounts[value] || 0) + 1;
      }
      if (code === 10) {
        const x = parseFloat(value);
        if (!Number.isNaN(x)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      }
      if (code === 20) {
        const y = parseFloat(value);
        if (!Number.isNaN(y)) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
      if (code === 1 && (currentEntity.type === "TEXT" || currentEntity.type === "MTEXT")) {
        if (value && textSamples.length < 20) textSamples.push(value.slice(0, 120));
      }
    }
  }

  const totalEntities = Object.values(entityCounts).reduce((a, b) => a + b, 0);
  const bounds = Number.isFinite(minX)
    ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
    : null;

  const layers = Object.entries(layerCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    entityCounts,
    totalEntities,
    layers,
    bounds,
    units,
    textSamples,
    dimensions: entityCounts["DIMENSION"] || 0,
    blocks: Array.from(blocks).slice(0, 50),
  };
}

function buildPrompt(filename: string, s: DxfSummary): string {
  return `Você é um engenheiro projetista analisando um arquivo DXF exportado de software CAD.
Gere uma DESCRIÇÃO TÉCNICA em português, em linguagem natural fluida, sobre o projeto representado por este arquivo.

Estruture em seções com títulos em markdown:
## Visão Geral
## Estrutura e Geometria
## Organização por Camadas
## Anotações e Textos
## Observações Técnicas

Seja preciso, cite números concretos (quantidades, dimensões, unidades). Infira o provável propósito do desenho (planta, corte, detalhe, peça mecânica, esquema elétrico etc.) a partir dos nomes de camadas e entidades. Não invente dados que não estão nos metadados.

Arquivo: ${filename}

Metadados extraídos:
- Unidades: ${s.units}
- Total de entidades: ${s.totalEntities}
- Entidades por tipo: ${JSON.stringify(s.entityCounts)}
- Camadas (nome, contagem): ${JSON.stringify(s.layers.slice(0, 30))}
- Blocos definidos: ${JSON.stringify(s.blocks)}
- Cotas (DIMENSION): ${s.dimensions}
- Caixa envolvente: ${s.bounds ? `${s.bounds.width.toFixed(2)} x ${s.bounds.height.toFixed(2)} ${s.units} (de (${s.bounds.minX.toFixed(2)}, ${s.bounds.minY.toFixed(2)}) a (${s.bounds.maxX.toFixed(2)}, ${s.bounds.maxY.toFixed(2)}))` : "indisponível"}
- Amostras de texto no desenho: ${JSON.stringify(s.textSamples)}`;
}

export const analyzeDxf = createServerFn({ method: "POST" })
  .inputValidator((data: { filename: string; content: string }) => {
    if (!data?.content || typeof data.content !== "string") throw new Error("Conteúdo DXF ausente");
    if (data.content.length > 20 * 1024 * 1024) throw new Error("Arquivo muito grande (máx 20MB)");
    return data;
  })
  .handler(async ({ data }) => {
    const summary = parseDxf(data.content);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { summary, description: null, error: "LOVABLE_API_KEY não configurada" };
    }

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você é um engenheiro projetista especialista em análise de desenhos CAD." },
            { role: "user", content: buildPrompt(data.filename, summary) },
          ],
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) return { summary, description: null, error: "Limite de requisições excedido. Tente novamente em alguns instantes." };
        if (resp.status === 402) return { summary, description: null, error: "Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage." };
        const t = await resp.text();
        console.error("AI gateway error:", resp.status, t);
        return { summary, description: null, error: `Erro da IA (${resp.status})` };
      }

      const json = await resp.json();
      const description = json.choices?.[0]?.message?.content ?? null;
      return { summary, description, error: null };
    } catch (e) {
      console.error("analyzeDxf failed:", e);
      return { summary, description: null, error: e instanceof Error ? e.message : "Falha desconhecida" };
    }
  });
