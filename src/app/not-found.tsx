import Link from "next/link";
export default function NotFound() { return <main id="main" className="empty-state"><span className="eyebrow">A CARD OUT OF PLACE</span><h1>Nothing on this table.</h1><p>That page may have moved. A fresh game is one click away.</p><Link href="/" className="primary-button">Back home →</Link></main>; }
