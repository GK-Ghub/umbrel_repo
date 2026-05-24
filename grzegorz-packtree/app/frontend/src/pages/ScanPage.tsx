import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { TreeNode } from '../types';
import { getQrData } from '../utils/api';

// Extend TreeNode with QR data wrapper
interface QrData {
  planId: string;
  planName: string;
  node: TreeNode;
}

// Add missing getQrData export check — it's defined in api.ts
export default function ScanPage() {
  const { planId, nodeId } = useParams<{ planId: string; nodeId: string }>();
  const [data, setData]   = useState<QrData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getQrData(planId!, nodeId!)
      .then(setData)
      .catch(() => setError('Container not found'));
  }, [planId, nodeId]);

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--font)' }}>
      <div style={{ textAlign: 'center', color: 'var(--danger)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div>{error}</div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="spinner" />
    </div>
  );

  const node = data.node;

  return (
    <div style={{ minHeight: '100vh', padding: 20, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text3)' }}>📦 {data.planName}</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{node.name}</h1>
      {node.state && (
        <div style={{ marginBottom: 16 }}>
          <span className="badge badge-warn">State: {node.state}</span>
        </div>
      )}

      {node.children?.length > 0 ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            {node.children.length} item{node.children.length !== 1 ? 's' : ''} inside
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {node.children.map((child) => (
              <ScanNode key={child._id} node={child} depth={0} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
          This container is empty
        </div>
      )}
    </div>
  );
}

function ScanNode({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {node.children?.length > 0 ? (
          <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}
            onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'}
          </button>
        ) : <span style={{ width: 20 }} />}
        <span>{node.children?.length > 0 ? '📦' : '🔹'}</span>
        <span style={{ flex: 1, fontWeight: 500, fontSize: 15 }}>{node.name}</span>
        {node.state && <span className="badge badge-warn" style={{ fontSize: 11 }}>{node.state}</span>}
      </div>
      {open && node.children?.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {node.children.map((child) => (
            <ScanNode key={child._id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
