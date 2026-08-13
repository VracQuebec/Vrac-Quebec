const FB_URL = "https://www.facebook.com/share/1ArYFDkkUX/?mibextid=wwXIfr";

const TickerContent = () => (
  <span className="inline-flex items-center gap-2 px-8 text-white/90 text-[11px] sm:text-xs font-body whitespace-nowrap">
    <span className="text-primary">🚛</span>
    <span>
      Livraison rapide coordonnée par{" "}
      <a
        href={FB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-semibold hover:underline hover:text-primary/80 transition-colors cursor-pointer"
      >
        Vrac Québec
      </a>{" "}
      partout dans la ville de Québec et les alentours.
    </span>
    <span className="mx-2 text-primary/60">•</span>
    <span>
      <span className="mr-1">👉</span>
      Visitez notre{" "}
      <a
        href={FB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-semibold hover:underline hover:text-primary/80 transition-colors cursor-pointer"
      >
        page Facebook
      </a>{" "}
      pour découvrir nos réalisations, nos livraisons, nos équipements et nos projets récents.
    </span>
    <span className="mx-2 text-primary/60">•</span>
  </span>
);

const TransportBanner = () => (
  <div className="w-full bg-[#1F2937] border-b border-primary/70 py-1.5 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-700">
    <div className="group relative flex overflow-hidden">
      <div className="flex shrink-0 animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        <TickerContent />
        <TickerContent />
      </div>
      <div
        aria-hidden="true"
        className="flex shrink-0 animate-marquee group-hover:[animation-play-state:paused] motion-reduce:hidden"
      >
        <TickerContent />
        <TickerContent />
      </div>
    </div>
  </div>
);

export default TransportBanner;
