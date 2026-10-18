import { SiteHeader } from "@/components/site-header";
import { Home } from "@/components/home";
export default function Page() {
  return <div className="site-shell"><SiteHeader /><Home /><footer className="site-footer"><span>A little friendly competition never hurt.</span><span>Independent fan project. Not affiliated with Mattel.</span></footer></div>;
}
