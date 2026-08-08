import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Simple finger/mouse signature pad that emits a PNG data URL. */
export function SignaturePad({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editing) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
  }, [editing]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  };

  const end = () => {
    drawing.current = false;
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        {value ? (
          <img
            src={value}
            alt="Client signature"
            className="h-24 w-full rounded-md border border-border bg-white object-contain"
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            No signature captured
          </div>
        )}
        {!disabled && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              {value ? "Re-sign" : "Capture signature"}
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-32 w-full touch-none rounded-md border border-border bg-white"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas || !dirty.current) return;
            onChange(canvas.toDataURL("image/png"));
            dirty.current = false;
            setEditing(false);
          }}
        >
          Save signature
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            dirty.current = false;
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Ask the client to sign above with a finger or mouse.
      </p>
    </div>
  );
}
