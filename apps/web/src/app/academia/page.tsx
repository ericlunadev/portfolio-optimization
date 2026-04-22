import { ZoomIntro } from "@/components/academia/ZoomIntro";
import { StationNav } from "@/components/academia/StationNav";
import { Station1Macro } from "@/components/academia/Station1Macro";
import { Station2Allocation } from "@/components/academia/Station2Allocation";
import { Station3Sectors } from "@/components/academia/Station3Sectors";
import { Station4Assets } from "@/components/academia/Station4Assets";
import { Station5Portfolio } from "@/components/academia/Station5Portfolio";

export default function AcademiaPage() {
  return (
    <div className="relative overflow-x-hidden">
      <StationNav />
      <div id="intro">
        <ZoomIntro />
      </div>
      <Station1Macro id="station-macro" />
      <Station2Allocation id="station-allocation" />
      <Station3Sectors id="station-sectors" />
      <Station4Assets id="station-assets" />
      <Station5Portfolio id="station-portfolio" />
      <footer className="py-16 text-center text-xs text-muted-foreground border-t border-border/30">
        Fin del recorrido · Los datos mostrados son ilustrativos
      </footer>
    </div>
  );
}
