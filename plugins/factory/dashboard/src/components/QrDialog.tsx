import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function QrDialog({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = urls[selected] ?? urls[0] ?? null;

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#09090b', light: '#ffffff' } })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Open on your phone">
          <Smartphone />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open on your phone</DialogTitle>
          <DialogDescription>Scan with your camera while your phone is on the same Wi-Fi network.</DialogDescription>
        </DialogHeader>
        {url ? (
          <>
            <div className="mx-auto w-full max-w-60 overflow-hidden rounded-xl border bg-white p-3 shadow-xs">
              {svg ? (
                // The SVG comes from the qrcode library, generated locally from our own URL.
                <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
              ) : (
                <div className="aspect-square animate-pulse rounded-md bg-zinc-100" />
              )}
            </div>
            {urls.length > 1 && (
              <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Network address">
                {urls.map((u, i) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={i === selected}
                    onClick={() => setSelected(i)}
                    className={cn('rounded-md border px-2 py-1 font-mono text-xs', i === selected ? 'border-foreground/40 bg-accent' : 'text-muted-foreground')}
                  >
                    {new URL(u).host}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-1 pl-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{url.replace(/\?t=.*/, '')}</code>
              <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy link with access token">
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">The link includes an access token. Only share it with devices you trust.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No network address found. Connect this computer to Wi-Fi or Ethernet, then restart the dashboard with <code className="font-mono text-xs">/factory:dashboard</code>.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
