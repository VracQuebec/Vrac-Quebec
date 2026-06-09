const TransportBanner = () => (
  <div className="w-full bg-[#1F2937] border-b-2 border-primary h-12 flex items-center justify-center px-4 animate-in fade-in slide-in-from-top-1 duration-700">
    <p className="text-white text-xs sm:text-sm font-body text-center leading-tight">
      <span className="text-primary mr-1">🚛</span>
      Livraison rapide assurée par{" "}
      <a
        href="https://www.facebook.com/share/1ArYFDkkUX/?mibextid=wwXIfr"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-semibold hover:underline hover:opacity-90 transition-opacity"
      >
        Transport JSC
      </a>{" "}
      partout dans la ville de Québec et les alentours.
    </p>
  </div>
);

export default TransportBanner;
