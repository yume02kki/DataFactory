import { useEffect, useState } from 'react';

const REPO = 'https://github.com/yume02kki/DataFactory';

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/**
 * A small pill in the corner of preview sites (e.g. /dev) naming the channel
 * and the commit it was built from; links to that commit on GitHub.
 */
export function ChannelPill() {
  const info = __BUILD_INFO__;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!info.channel || info.channel === 'main') return null;
  const when = info.time ? new Date(info.time) : null;
  return (
    <a
      className="channel-pill"
      href={info.sha ? `${REPO}/commit/${info.sha}` : REPO}
      target="_blank"
      rel="noreferrer"
      title={`${info.channel} · ${info.sha.slice(0, 7)} · ${when ? when.toLocaleString() : ''}\n${info.message}`}
    >
      <span className="channel-name">{info.channel}</span>
      {when && <span className="channel-time">{ago(info.time, now)}</span>}
      <span className="channel-msg">{info.message}</span>
    </a>
  );
}
