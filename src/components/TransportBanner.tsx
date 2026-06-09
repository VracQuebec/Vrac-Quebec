const TransportBanner = () => (
  <div className="w-full bg-[#1F2937] border-b-2 border-primary py-2.5 flex flex-col items-center justify-center px-4 gap-0.5 animate-in fade-in slide-in-from-top-1 duration-700">
    <p className="text-white text-xs sm:text-sm font-body text-center leading-tight">
      <span className="text-primary mr-1">🚛</span>
      Livraison rapide assurée par{" "}
      <a
        href="https://www.facebook.com/share/1ArYFDkkUX/?mibextid=wwXIfr"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-semibold hover:underline hover:text-primary/80 transition-colors cursor-pointer"
      >
        Transport JSC
      </a>{" "}
      partout dans la ville de Québec et les alentours.
    </p>
    <p className="text-white/90 text-xs sm:text-sm font-body text-center leading-tight">
      <span className="mr-1">👉</span>
      Visitez notre{" "}
      <a
        href="https://www.facebook.com/share/1ArYFDkkUX/?mibextid=wwXIfr"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-semibold hover:underline hover:text-primary/80 transition-colors cursor-pointer"
      >
        page Facebook
      </a>{" "}
      pour voir nos réalisations, nos livraisons et nos projets récents.
    </p>
  </div>
);

export default TransportBanner;
