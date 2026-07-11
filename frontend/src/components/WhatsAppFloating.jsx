/**
 * Floating WhatsApp CTA — bottom-right of the viewport.
 * Pulses subtly to draw attention without being aggressive.
 *
 * Tap → opens WhatsApp chat with Noby's number.
 */
const PHONE = '263774603865';
const PRESET_TEXT = encodeURIComponent(
  "Hi Noby — I came across ManishaPay and wanted to ask…",
);

export default function WhatsAppFloating() {
  return (
    <a
      href={`https://wa.me/${PHONE}?text=${PRESET_TEXT}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Noby on WhatsApp"
      className="group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl shadow-brand-900/40 transition-transform hover:scale-110 active:scale-95"
    >
      {/* Pulsing halo */}
      <span
        aria-hidden="true"
        className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-30 motion-reduce:hidden"
      />
      <span
        aria-hidden="true"
        className="absolute -inset-1 animate-pulse rounded-full bg-[#25D366]/15 motion-reduce:hidden"
      />

      {/* WhatsApp glyph */}
      <svg viewBox="0 0 24 24" className="relative h-7 w-7" fill="currentColor" aria-hidden="true">
        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.149-.174.198-.298.298-.496.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
      </svg>

      {/* Hover label */}
      <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 opacity-0 shadow-lg ring-1 ring-slate-700 transition-opacity group-hover:opacity-100">
        Chat on WhatsApp
      </span>
    </a>
  );
}
