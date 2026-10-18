import Link from "next/link";
import { Rules } from "./rules";
export function SiteHeader({ room = false }: { room?: boolean }) {
  return <header className={"site-header " + (room ? "room-header" : "")}>
    <Link href="/" className="brand" aria-label="UNO Online home">
      <span className="brand-mark" aria-hidden="true"><span /><span /></span>
      <span>UNO{" "}<span className="brand-online">ONLINE</span></span>
    </Link>
    <nav aria-label="Main navigation" className="flex items-center gap-4 sm:gap-7">
      <span className="header-caption hidden sm:block">A GOOD TIME, DEALT DAILY.</span><Rules />
      <a href="https://github.com/d1vyom/uno-online" target="_blank" rel="noreferrer" className="github-link" aria-label="View source on GitHub">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .7a11.3 11.3 0 0 0-3.57 22c.56.1.77-.24.77-.54v-2.11c-3.15.69-3.82-1.33-3.82-1.33-.51-1.3-1.26-1.65-1.26-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.73 1.17 1.73 1.17 1.01 1.72 2.65 1.22 3.29.93.1-.73.39-1.22.72-1.5-2.51-.29-5.15-1.26-5.15-5.59 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.11 1.16a10.8 10.8 0 0 1 5.66 0c2.16-1.47 3.11-1.16 3.11-1.16.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.34-2.65 5.3-5.17 5.58.4.35.77 1.04.77 2.1v3.09c0 .3.2.65.78.54A11.3 11.3 0 0 0 12 .7Z" /></svg>
      </a>
    </nav>
  </header>;
}
