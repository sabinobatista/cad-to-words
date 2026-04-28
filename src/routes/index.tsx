import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { analyzeDxf } from "@/utils/dxf.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DXF Reader — Descrição técnica de projetos CAD por IA" },
      { name: "description", content: "Envie um arquivo DXF exportado do seu software CAD e receba uma descrição técnica completa do projeto em linguagem natural, gerada por IA." },
    ],
  }),
  component: Index,
});

type Summary = {
  entityCounts: Record<string, number>;
  totalEntities: number;
  layers: { name: string; count: number }[];
  bounds: { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number } | null;
  units: string;
  textSamples: string[];
  dimensions: number;
  blocks: string[];
};

function Index() {
  const analyze = useServerFn(analyzeDxf);
  const [filename, setFilename] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setSummary(null);
    setDescription(null);
    setFilename(file.name);

    if (!/\.dxf$/i.test(file.name)) {
      setError("Formato não suportado. Envie um arquivo .dxf (DXF ASCII).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Arquivo muito grande (máx 20MB).");
      return;
    }

    setLoading(true);
    try {
      const content = await file.text();
      const result = await analyze({ data: { filename: file.name, content } });
      setSummary(result.summary);
      setDescription(result.description);
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao processar arquivo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur-sm bg-background/40 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center">
              <span className="mono text-primary text-sm font-bold">◢</span>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">DXF Reader</h1>
              <p className="text-xs text-muted-foreground mono">cad · ai · natural language</p>
            </div>
          </div>
          <div className="text-xs mono text-muted-foreground hidden sm:block">
            v0.1 · DXF ASCII
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
            Transforme arquivos <span className="text-primary">DXF</span> em descrições técnicas de engenharia.
          </h2>
          <p className="mt-5 text-muted-foreground max-w-xl leading-relaxed">
            Envie um desenho exportado do AutoCAD, BricsCAD, LibreCAD ou similar. Extraímos camadas, entidades, cotas e dimensões, e a IA gera uma descrição técnica completa do projeto.
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
            accept=".dxf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="mx-auto max-w-md">
            <div className="mono text-xs text-muted-foreground mb-3">[drop zone]</div>
            <p className="text-lg font-medium mb-1">Arraste seu arquivo .dxf aqui</p>
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
            parseando entidades e consultando modelo de IA...
          </div>
        )}

        {summary && (
          <div className="mt-10 grid lg:grid-cols-5 gap-6">
            <aside className="lg:col-span-2 space-y-4">
              <StatCard label="entidades" value={summary.totalEntities.toString()} />
              <StatCard label="camadas" value={summary.layers.length.toString()} />
              <StatCard
                label="caixa envolvente"
                value={summary.bounds ? `${summary.bounds.width.toFixed(1)} × ${summary.bounds.height.toFixed(1)}` : "—"}
                sub={summary.units}
              />
              <StatCard label="cotas (DIMENSION)" value={summary.dimensions.toString()} />

              <Panel title="tipos de entidade">
                <ul className="space-y-1.5 text-sm mono">
                  {Object.entries(summary.entityCounts)
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
                  {summary.layers.slice(0, 30).map((l) => (
                    <li key={l.name} className="flex justify-between gap-3 border-b border-border/40 pb-1">
                      <span className="text-muted-foreground truncate">{l.name}</span>
                      <span className="text-accent shrink-0">{l.count}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
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
          <span>dxf · parser + gemini</span>
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
