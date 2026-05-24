import { useEffect, useRef, useState } from 'react';
import { getExportUrl, importData, getDataStats } from '../utils/api';

type Scope = 'items' | 'plans' | 'templates';
const ALL_SCOPES: Scope[] = ['items', 'plans', 'templates'];

interface Stats { items: number; plans: number; templates: number }
interface ImportReport { items: number; plans: number; templates: number }

export default function ImportExportPage() {
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [exportScope,  setExportScope]  = useState<Scope[]>([...ALL_SCOPES]);
  const [importScope,  setImportScope]  = useState<Scope[]>([...ALL_SCOPES]);
  const [importMode,   setImportMode]   = useState<'merge' | 'replace'>('merge');
  const [importFile,   setImportFile]   = useState<File | null>(null);
  const [importBundle, setImportBundle] = useState<unknown>(null);
  const [parseError,   setParseError]   = useState('');
  const [importing,    setImporting]    = useState(false);
  const [report,       setReport]       = useState<{ mode: string; report: ImportReport } | null>(null);
  const [reportError,  setReportError]  = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStats = () => {
    getDataStats().then(setStats).catch(() => {});
  };
  useEffect(loadStats, []);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (exportScope.length === 0) return;
    const url = getExportUrl(exportScope);
    const a = document.createElement('a');
    a.href = url;
    a.download = `packtree-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const toggleExportScope = (s: Scope) =>
    setExportScope((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  // ── Import file parsing ───────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportBundle(null);
    setParseError('');
    setReport(null);
    setReportError('');
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed._packtree_version !== 1) {
          setParseError('This file is not a valid PackTree export (missing version marker).');
          return;
        }
        setImportBundle(parsed);
      } catch {
        setParseError('Could not parse JSON — make sure the file is a valid PackTree export.');
      }
    };
    reader.readAsText(file);
  };

  const toggleImportScope = (s: Scope) =>
    setImportScope((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  const handleImport = async () => {
    if (!importBundle || importScope.length === 0) return;
    if (importMode === 'replace') {
      const confirmed = confirm(
        `⚠️ REPLACE mode will permanently DELETE all existing ${importScope.join(', ')} and replace them with the imported data.\n\nAre you sure?`
      );
      if (!confirmed) return;
    }
    setImporting(true);
    setReport(null);
    setReportError('');
    try {
      const result = await importData({ bundle: importBundle, mode: importMode, include: importScope });
      const typedResult = result as unknown as { mode: string; report: ImportReport };
      setReport(typedResult);
      loadStats();
      // Reset file input
      setImportFile(null);
      setImportBundle(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setReportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  // ── Bundle preview ────────────────────────────────────────────────────────

  const bundleInfo = importBundle as Record<string, unknown[]> | null;
  const bundleCounts = bundleInfo
    ? {
        items:     Array.isArray(bundleInfo.items)     ? bundleInfo.items.length     : null,
        plans:     Array.isArray(bundleInfo.plans)     ? bundleInfo.plans.length     : null,
        templates: Array.isArray(bundleInfo.templates) ? bundleInfo.templates.length : null,
        exportedAt: bundleInfo.exported_at as unknown as string | undefined,
      }
    : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Import / Export</h1>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28, maxWidth: 560 }}>
        Export your data as a portable JSON file and import it back on any instance.
        Use <strong>Merge</strong> to add/update without touching other records,
        or <strong>Replace</strong> to fully overwrite a collection.
      </p>

      {/* Current DB stats */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
          {ALL_SCOPES.map((s) => (
            <div key={s} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 140 }}>
              <span style={{ fontSize: 22 }}>{ICONS[s]}</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats[s]}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'capitalize' }}>{s}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20, alignItems: 'start' }}>

        {/* ── Export card ── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>📤</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Export</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Download a JSON backup</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>Include in export</div>
            {ALL_SCOPES.map((s) => (
              <ScopeCheckbox
                key={s}
                scope={s}
                checked={exportScope.includes(s)}
                count={stats?.[s]}
                onChange={() => toggleExportScope(s)}
              />
            ))}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exportScope.length === 0}
            style={{ alignSelf: 'flex-start' }}
          >
            📥 Download JSON
          </button>
        </div>

        {/* ── Import card ── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>📥</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Import</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Restore from a JSON file</div>
            </div>
          </div>

          {/* File picker */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>
            PackTree JSON file
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              style={{ background: 'none', border: 'none', padding: '4px 0', fontSize: 13, color: 'var(--text)' }}
            />
          </label>

          {parseError && (
            <div style={{ background: '#3b1a1a', border: '1px solid #5a2020', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--danger)' }}>
              {parseError}
            </div>
          )}

          {/* Bundle preview */}
          {bundleCounts && (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>File contents</div>
              {bundleCounts.exportedAt && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                  Exported: {new Date(bundleCounts.exportedAt).toLocaleString()}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ALL_SCOPES.map((s) =>
                  bundleCounts[s] !== null ? (
                    <span key={s} className="badge badge-accent" style={{ fontSize: 12 }}>
                      {ICONS[s]} {bundleCounts[s]} {s}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* What to import */}
          {bundleInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>Import these collections</div>
              {ALL_SCOPES.filter((s) => Array.isArray(bundleInfo[s])).map((s) => (
                <ScopeCheckbox
                  key={s}
                  scope={s}
                  checked={importScope.includes(s)}
                  count={Array.isArray(bundleInfo[s]) ? (bundleInfo[s] as unknown[]).length : undefined}
                  onChange={() => toggleImportScope(s)}
                />
              ))}
            </div>
          )}

          {/* Import mode */}
          {bundleInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>Import mode</div>
              {(['merge', 'replace'] as const).map((mode) => (
                <label key={mode} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 10, border: `1px solid ${importMode === mode ? 'var(--accent2)' : 'var(--border)'}`, background: importMode === mode ? 'rgba(110,231,183,0.07)' : 'var(--bg3)', transition: 'all .12s' }}>
                  <input type="radio" name="importMode" checked={importMode === mode}
                    onChange={() => setImportMode(mode)}
                    style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {mode === 'merge' ? '🔀 Merge' : '⚠️ Replace'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      {mode === 'merge'
                        ? 'Add new records and update existing ones by ID. Safe — keeps records not in the file.'
                        : 'Delete ALL existing records in selected collections, then insert from file. Destructive!'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Import button */}
          {bundleInfo && (
            <button
              className={`btn ${importMode === 'replace' ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleImport}
              disabled={importing || importScope.length === 0}
              style={{ alignSelf: 'flex-start' }}
            >
              {importing
                ? <span className="spinner" style={{ width: 16, height: 16 }} />
                : importMode === 'replace' ? '⚠️ Replace & import' : '⬆ Merge & import'}
            </button>
          )}

          {/* Result */}
          {report && (
            <div style={{ background: '#0d2a1f', border: '1px solid #1a4a35', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>
                ✓ Import complete ({report.mode})
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ALL_SCOPES.map((s) => (
                  <span key={s} className="badge badge-accent" style={{ fontSize: 12 }}>
                    {ICONS[s]} {report.report[s]} {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {reportError && (
            <div style={{ background: '#3b1a1a', border: '1px solid #5a2020', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--danger)' }}>
              {reportError}
            </div>
          )}
        </div>
      </div>

      {/* Usage notes */}
      <div style={{ marginTop: 32, padding: '16px 20px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, maxWidth: 700 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text2)' }}>
          Notes & use-cases
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text3)' }}>
          <div>
            <span style={{ color: 'var(--text2)', fontWeight: 500 }}>Regular backup</span> — export all three
            collections weekly. Merge-import to restore without wiping anything else.
          </div>
          <div>
            <span style={{ color: 'var(--text2)', fontWeight: 500 }}>Migration / new device</span> — export
            everything on the old instance, Replace-import on the fresh one.
          </div>
          <div>
            <span style={{ color: 'var(--text2)', fontWeight: 500 }}>Sharing templates</span> — export only
            Templates and send the file to a friend. They can Merge-import just the templates
            without touching their items or plans.
          </div>
          <div>
            <span style={{ color: 'var(--text2)', fontWeight: 500 }}>Selective restore</span> — accidentally
            deleted items? Export items from a backup file, then Merge-import only items.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ICONS: Record<Scope, string> = {
  items:     '📦',
  plans:     '🗂',
  templates: '🧩',
};

function ScopeCheckbox({ scope, checked, count, onChange }: {
  scope: Scope;
  checked: boolean;
  count?: number | null;
  onChange: () => void;
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      borderRadius: 8, cursor: 'pointer', fontSize: 13,
      border: `1px solid ${checked ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`,
      background: checked ? 'rgba(110,231,183,0.07)' : 'var(--bg3)',
      transition: 'all .12s',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange}
        style={{ width: 'auto', accentColor: 'var(--accent)' }} />
      <span style={{ fontSize: 16 }}>{ICONS[scope]}</span>
      <span style={{ flex: 1, textTransform: 'capitalize', fontWeight: 500 }}>{scope}</span>
      {count != null && (
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{count} records</span>
      )}
    </label>
  );
}
