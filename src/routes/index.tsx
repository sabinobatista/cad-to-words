import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { analyzeDxf } from "@/utils/dxf.functions";
import { analyzePdf } from "@/utils/pdf.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CAD Reader — Descrição técnica de projetos CAD (DXF/PDF) por IA" },
      { name: "description", content: "Envie um arquivo DXF ou PDF exportado do seu software CAD e receba uma descrição técnica completa do projeto em linguagem natural, gerada por IA." },
    ],
  }),
  component: Index,
});

type DxfSummary = {
  kind?: "dxf";
  entityCounts: Record<string, number>;
  totalEntities: number;
  layers: { name: string; count: number }[];
  bounds: { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number } | null;
  units: string;
  textSamples: string[];
  dimensions: number;
  blocks: string[];
};
type PdfSummary = {
  kind: "pdf";
  pages: number;
  info: Record<string, string>;
  pageSizes: { page: number; width: number; height: number }[];
  totalChars: number;
  textByPage: { page: number; chars: number; preview: string }[];
};
type AnySummary = (DxfSummary & { kind?: "dxf" }) | PdfSummary;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result as string;
      resolve(res.split(",")[1] ?? "");
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function Index() {
  const analyzeDxfFn = useServerFn(analyzeDxf);
  const analyzePdfFn = useServerFn(analyzePdf);
  const [filename, setFilename] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnySummary | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setSummary(null);
    setDescription(null);
    setFilename(file.name);

    const isDxf = /\.dxf$/i.test(file.name);
    const isPdf = /\.pdf$/i.test(file.name);
    if (!isDxf && !isPdf) {
      setError("Formato não suportado. Envie um arquivo .dxf ou .pdf.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Arquivo muito grande (máx 20MB).");
      return;
    }

    setLoading(true);
    try {
      if (isDxf) {
        const content = await file.text();
        const r = await analyzeDxfFn({ data: { filename: file.name, content } });
        setSummary(r.summary as DxfSummary);
        setDescription(r.description);
        if (r.error) setError(r.error);
      } else {
        const base64 = await fileToBase64(file);
        const r = await analyzePdfFn({ data: { filename: file.name, base64 } });
        setSummary(r.summary);
        setDescription(r.description);
        if (r.error) setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao processar arquivo");
    } finally {
      setLoading(false);
    }
  }

  const isPdf = summary && (summary as PdfSummary).kind === "pdf";
  const dxf = !isPdf ? (summary as DxfSummary | null) : null;
  const pdf = isPdf ? (summary as PdfSummary) : null;

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur-sm bg-background/40 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center">
              <span className="mono text-primary text-sm font-bold">◢</span>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">CAD Reader</h1>
              <p className="text-xs text-muted-foreground mono">dxf · pdf · ai</p>
            </div>
          </div>
          <div className="text-xs mono text-muted-foreground hidden sm:block">
            v0.2 · DXF + PDF
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-16 pb-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs mono text-primary border border-primary/30 bg-primary/5 px-3 py-1 rounded-full mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            análise técnica automatizada
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05]">
            Transforme arquivos <span className="text-primary">DXF</span> e <span className="text-accent">PDF</span> em descrições técnicas de engenharia.
          </h2>
          <p className="mt-5 text-muted-foreground max-w-xl leading-relaxed">
            Envie um desenho exportado do seu CAD (AutoCAD, BricsCAD, LibreCAD, Revit). Extraímos camadas, entidades, textos, páginas e dimensões — e a IA gera uma descrição técnica completa do projeto.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={`relative rounded-xl border-2 border-dashed p-10 sm:p-14 text-center transition-colors bg-card/40 ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".dxf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="mx-auto max-w-md">
            <div className="mono text-xs text-muted-foreground mb-3">[drop zone · .dxf · .pdf]</div>
            <p className="text-lg font-medium mb-1">Arraste seu arquivo aqui</p>
            <p className="text-sm text-muted-foreground mb-6">ou clique abaixo para selecionar</p>
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="mono"
              size="lg"
            >
              {loading ? "analisando..." : "selecionar arquivo"}
            </Button>
            {filename && (
              <p className="mt-5 text-xs mono text-muted-foreground truncate">
                → {filename}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 text-destructive-foreground px-4 py-3 text-sm">
            <span className="mono text-destructive">ERR:</span> {error}
          </div>
        )}

        {loading && (
          <div className="mt-10 flex items-center gap-3 text-sm text-muted-foreground mono">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            extraindo conteúdo e consultando modelo de IA...
          </div>
        )}

        {summary && (
          <div className="mt-10 grid lg:grid-cols-5 gap-6">
            <aside className="lg:col-span-2 space-y-4">
              {dxf && (
                <>
                  <StatCard label="entidades" value={dxf.totalEntities.toString()} />
                  <StatCard label="camadas" value={dxf.layers.length.toString()} />
                  <StatCard
                    label="caixa envolvente"
                    value={dxf.bounds ? `${dxf.bounds.width.toFixed(1)} × ${dxf.bounds.height.toFixed(1)}` : "—"}
                    sub={dxf.units}
                  />
                  <StatCard label="cotas (DIMENSION)" value={dxf.dimensions.toString()} />

                  <Panel title="tipos de entidade">
                    <ul className="space-y-1.5 text-sm mono">
                      {Object.entries(dxf.entityCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 12)
                        .map(([k, v]) => (
                          <li key={k} className="flex justify-between border-b border-border/40 pb-1">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="text-primary">{v}</span>
                          </li>
                        ))}
                    </ul>
                  </Panel>

                  <Panel title="camadas">
                    <ul className="space-y-1.5 text-sm mono max-h-64 overflow-auto pr-2">
                      {dxf.layers.slice(0, 30).map((l) => (
                        <li key={l.name} className="flex justify-between gap-3 border-b border-border/40 pb-1">
                          <span className="text-muted-foreground truncate">{l.name}</span>
                          <span className="text-accent shrink-0">{l.count}</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                </>
              )}

              {pdf && (
                <>
                  <StatCard label="páginas" value={pdf.pages.toString()} />
                  <StatCard label="caracteres de texto" value={pdf.totalChars.toLocaleString("pt-BR")} />
                  <StatCard
                    label="primeira página"
                    value={pdf.pageSizes[0] ? `${pdf.pageSizes[0].width} × ${pdf.pageSizes[0].height}` : "—"}
                    sub="pt"
                  />

                  {Object.keys(pdf.info).length > 0 && (
                    <Panel title="metadados do documento">
                      <ul className="space-y-1.5 text-sm mono">
                        {Object.entries(pdf.info).slice(0, 8).map(([k, v]) => (
                          <li key={k} className="flex justify-between gap-3 border-b border-border/40 pb-1">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="text-primary truncate max-w-[60%]" title={v}>{v}</span>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  )}

                  <Panel title="páginas">
                    <ul className="space-y-1.5 text-sm mono max-h-64 overflow-auto pr-2">
                      {pdf.pageSizes.map((p) => {
                        const tp = pdf.textByPage.find((x) => x.page === p.page);
                        return (
                          <li key={p.page} className="flex justify-between gap-3 border-b border-border/40 pb-1">
                            <span className="text-muted-foreground">p{p.page} · {p.width}×{p.height}</span>
                            <span className="text-accent shrink-0">{tp?.chars ?? 0} ch</span>
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                </>
              )}
            </aside>

            <div className="lg:col-span-3">
              <Panel title="descrição técnica · IA">
                {description ? (
                  <article className="prose-custom">
                    <ReactMarkdown>{description}</ReactMarkdown>
                  </article>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {error ?? "Descrição indisponível."}
                  </p>
                )}
              </Panel>
            </div>
          </div>
        )}
      </section>

      <footer className="border-t border-border/60 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-6 text-xs mono text-muted-foreground flex justify-between">
          <span>dxf · pdf · gemini</span>
          <span>processado localmente no servidor</span>
        </div>
      </footer>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-4 py-3">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight mono">{value}</span>
        {sub && <span className="text-xs text-muted-foreground mono">{sub}</span>}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/60">
      <div className="border-b border-border/70 px-4 py-2.5 mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
