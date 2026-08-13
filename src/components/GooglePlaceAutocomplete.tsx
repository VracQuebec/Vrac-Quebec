import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect?: (data: {
    formattedAddress: string;
    placeId: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
    components?: { longText?: string | null; shortText?: string | null; types?: string[] }[];
  }) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Champ adresse avec auto-complétion Google Places (New API).
 * Fallback en input simple si Google ne charge pas.
 */
const GooglePlaceAutocomplete = ({ value, onChange, onSelect, placeholder, className }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async (g) => {
        if (cancelled) return;
        const { AutocompleteSessionToken } = (await g.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        tokenRef.current = new AutocompleteSessionToken();
      })
      .catch(() => { /* fallback to plain input */ });
    return () => { cancelled = true; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node) && suggestionsRef.current) {
        suggestionsRef.current.innerHTML = "";
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const fetchSuggestions = async (input: string) => {
    if (!suggestionsRef.current) return;
    if (!input || input.length < 3) {
      suggestionsRef.current.innerHTML = "";
      return;
    }
    try {
      const g = (window as any).google;
      if (!g?.maps?.places) return;
      const { AutocompleteSuggestion } = (await g.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: tokenRef.current ?? undefined,
        includedRegionCodes: ["ca"],
        language: "fr",
      });
      renderSuggestions(suggestions);
    } catch {
      /* ignore */
    }
  };

  const renderSuggestions = (
    suggestions: google.maps.places.AutocompleteSuggestion[]
  ) => {
    if (!suggestionsRef.current) return;
    suggestionsRef.current.innerHTML = "";
    suggestions.slice(0, 5).forEach((s) => {
      const pp = s.placePrediction;
      if (!pp) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none border-b border-border last:border-b-0 font-body";
      btn.textContent = pp.text?.toString() || "";
      btn.onclick = async (e) => {
        e.preventDefault();
        const place = pp.toPlace();
        await place.fetchFields({
          fields: ["formattedAddress", "id", "location", "addressComponents"],
        });
        const fa = place.formattedAddress || pp.text?.toString() || "";
        const loc = place.location;
        const postal = place.addressComponents?.find((c) =>
          c.types?.includes("postal_code")
        )?.longText;
        onChange(fa);
        onSelect?.({
          formattedAddress: fa,
          placeId: place.id || "",
          postalCode: postal || undefined,
          lat: loc?.lat() ?? undefined,
          lng: loc?.lng() ?? undefined,
          components: (place.addressComponents || []).map((c) => ({
            longText: c.longText ?? null,
            shortText: c.shortText ?? null,
            types: (c.types || []) as string[],
          })),
        });
        if (suggestionsRef.current) suggestionsRef.current.innerHTML = "";
        // New session token after each selection
        const g = (window as any).google;
        const { AutocompleteSessionToken } = (await g.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        tokenRef.current = new AutocompleteSessionToken();
      };
      suggestionsRef.current!.appendChild(btn);
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      <div
        ref={suggestionsRef}
        className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden empty:hidden"
      />
    </div>
  );
};

export default GooglePlaceAutocomplete;