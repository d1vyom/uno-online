"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="empty-state"><h1>Let’s reshuffle.</h1><p>Something interrupted the page. Your room may still be waiting.</p><button className="primary-button" onClick={reset}>Try again</button><Link href="/" className="nav-link">Back home</Link></main>; }
