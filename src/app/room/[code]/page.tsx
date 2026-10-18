import { RoomView } from "@/components/room";
import { SiteHeader } from "@/components/site-header";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <div className="site-shell"><SiteHeader room /><RoomView code={code.toUpperCase()} /></div>;
}
