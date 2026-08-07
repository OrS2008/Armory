import { useEffect, useRef, useState } from 'react';

export function SignaturePad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
      if (canvas.width === Math.round(rect.width * ratio) && canvas.height === Math.round(rect.height * ratio)) return;
      canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext('2d'); ctx?.scale(ratio, ratio);
    };
    resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true;
    const ctx = event.currentTarget.getContext('2d'); const p = point(event); if (!ctx) return;
    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.strokeStyle='#0e6f52'; ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.lineJoin='round';
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if(!drawing.current) return; const ctx=event.currentTarget.getContext('2d'); const p=point(event); ctx?.lineTo(p.x,p.y); ctx?.stroke(); setHasInk(true); };
  const finish = () => { drawing.current=false; const canvas=canvasRef.current; if(hasInk && canvas) canvas.toBlob((blob)=>onChange(blob),'image/png'); };
  const clear = () => { const canvas=canvasRef.current; if(!canvas)return; canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height); setHasInk(false); onChange(null); };
  return <div className="signature-pad">
    <div className="signature-toolbar"><span>חתמו בתוך המסגרת</span><button type="button" onClick={clear} disabled={!hasInk}>ניקוי חתימה</button></div>
    <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="משטח חתימה ידנית" />
    <small>החתימה מאשרת את קבלת הציוד והאחריות להחזרתו.</small>
  </div>;
}
